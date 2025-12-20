# Torvely Backend - Briefing for Claude

## Mission
- Node.js/Express backend that orchestrates Torvely's SBA loan automation: collects applications, generates and signs SBA forms, stores artifacts in S3, keeps the bank loop updated, and coordinates AI assistants across web, email, and voice.
- Written in TypeScript and compiled via `tsc`; app entry point is `src/main.ts` which wires routes, async pollers, Mongo, Socket.IO, and Vapi voice events.
- AI capabilities are brokered through LangChain `ChatOpenAI` wrappers defined in `src/agents`, giving consistent logging and configuration plus tooling for document, email, and chat agents.

## Run Locally
- Requirements: Node 18+, MongoDB (default URI `mongodb://localhost:27017/torvely_ai`), access to AWS S3, SMTP, IMAP, OpenAI, and optional Vapi credentials.
- Copy `.env` (not in repo) and fill: `OPENAI_API_KEY`, `VAPI_API_KEY`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, `IMAP_*`, `SMTP_*`, and other integration keys.
- Install deps with `npm install`; start watcher via `npm run dev`. Production build uses `npm run build` then `npm start` from repo root so filesystem lookups resolve.
- Ensure local directories exist (`templates/`, `generated/`, `processed/`, `uploads/`). The service auto-creates some folders but templates must be seeded manually.

## Architecture Map
- **Entry (`src/main.ts`)**: loads env, initializes Mongo, sets up Express, CORS, JSON parsing, routers (`/api/docs`, `/api/emails`, `/api/applications`, `/api/banks`), WebSocket layer (`services/websocket.ts`), and kicks off the IMAP poller (`services/poller.ts`). Also exposes a minimal chat chain, Vapi voice assistant creation endpoint (`POST /api/create-vapi-assistant`), Vapi webhook handler (`POST /vapi-ai`), and transcript analysis that broadcasts JSON field updates over websockets. The voice assistant uses OpenAI `gpt-5` and `gpt-5-mini` models with extensive tool-calling capabilities for loan application intake and status checks.
- **Routers (`src/routes`)**: thin controllers returning `{ success, data | error }`. They delegate to service logic and enforce validation (see `routes/applications.ts` for detailed parsing of AI tool-call payloads). Key routers include:
  - `applications.ts`: handles application CRUD, draft applications, document uploads (unsigned/signed/user-provided/draft), SBA eligibility calculations, offers, and bank submissions.
  - `banks.ts`: manages bank partners and their requirements.
  - `emails.ts`: email management endpoints.
  - `docs.ts`: document processing endpoints.
- **Services (`src/services`)**:
  - `applicationService.ts`: canonical pipeline for SBA applications; generates forms, uploads to S3, tracks status transitions, handles signed docs, user uploads, bank submissions, and SBA eligibility calculators. Includes both buyer and owner flow logic with distinct field requirements. Supports draft applications with PDF generation and conversion to full applications.
  - `pdfFormProcessor.ts` plus `documentProcessor.ts`: extract PDF form fields, map applicant data via the DocumentAgent, fill forms with `pdf-lib`, and persist metadata to disk. Includes `CHECKBOX_GROUPS` configuration defining checkbox field groups (entity, veteranStatus, sex, race, ethnicity, specialOwnershipType) with user-friendly values mapped to PDF field names, plus `getGroupCheckboxes()` helper for retrieving all fields in a group.
  - `emailFetcher.ts` -> `emailHandler.ts` -> `emailSender.ts`: polls IMAP, summarizes messages with the EmailAgent, optionally responds via SMTP, and stores structured artifacts under `processed/emails`.
  - `poller.ts`: schedules inbox polling (default every 20 seconds) and hands replies to the sender.
  - `s3Service.ts`: wraps AWS SDK with retrying uploads, presigned URLs, delete/list helpers. Keys follow `applications/{applicationId}/{fileName}` for standard docs and `drafts/{applicationId}/{fileName}` for draft PDFs.
  - `websocket.ts`: manages Socket.IO rooms (`global` plus per-call rooms), rebroadcasts Vapi events, and supports transcript-derived form field pushes. Emits events like `form-field-update`, `calculate-chances`, `form-reveal`, `draft-updated`, `highlight-fields`, and `checkbox-selection`.
- **Agents (`src/agents`)**: `BaseAgent.ts` centralizes LangChain setup via `processWithLLM`. `DocumentAgent`, `EmailAgent`, and `ChatboxAgent` build on it for domain-specific prompts and storage helpers. New LLM flows should route through these helpers for consistent logging and throttling.
  - `ChatboxAgent.ts`: Text-based chat agent using OpenAI function calling. Mirrors the Vapi voice webhook handler capabilities but for chat/messaging. Uses `CHAT_TOOLS` array defining 23+ function definitions for data capture (name, business info, financials, checkboxes, etc.). Provides `processChat()` which invokes LLM with full conversation history and returns response with tool calls.
- **Models (`src/models`)**: Mongoose schemas (`Application.ts`, `Bank.ts`, `ChatSession.ts`) aligned with TypeScript contracts in `src/types/index.ts`. `ChatSession.ts` stores persistent chat sessions with full conversation history, user data captured via tool calls, and optional linked application ID. The `Application` schema supports both `owner` and `buyer` user types with type-specific fields, loan chance scoring, draft documents, and extensive document tracking (unsigned, signed, user-provided, draft). Update enums (for example, `ApplicationStatus`) whenever introducing new lifecycle states. Current statuses include: `draft`, `submitted`, `processing`, `documents_generated`, `awaiting_signature`, `signed`, `sent_to_bank`, `under_review`, `approved`, `rejected`, `cancelled`.
- **Utilities (`src/utils`)**: `formatters.ts` formats application status snapshots for voice agent responses.

## Core Flows
- **SBA Application Intake**
  - **Draft Application Flow** (new):
    - `POST /api/applications/draft`: creates draft application with minimal validation, calculates SBA eligibility (buyer or owner flow), generates draft PDFs, uploads to S3 under `drafts/{applicationId}/`, broadcasts `form-reveal` event with presigned PDF URLs for real-time preview.
    - `PATCH /api/applications/:id/draft`: allows uploading edited PDF documents to replace draft versions.
    - `PATCH /api/applications/:id/convert`: converts draft to full application with complete validation, preserving userType from draft.
  - **Full Application Flow**:
    - `POST /api/applications`: validates payload (owner requires `monthlyRevenue`, `monthlyExpenses`, `requestedLoanAmount`, `loanPurpose`; buyer requires `purchasePrice`, `availableCash`, `businessCashFlow`, `industryExperience`), calls `createApplication()` which stores applicant data, marks status `submitted`, and asynchronously triggers `processApplicationAsync`.
    - `processApplicationAsync`: bumps status to `processing`, generates SBA PDFs (`SBAForm1919`, `SBAForm413`) via DocumentAgent plus PDF filling, uploads unsigned docs to S3, updates status to `awaiting_signature`, and cleans local artifacts.
  - **Signing & Submission**:
    - Signed docs arrive through `handleSignedDocuments` or `POST /:id/documents/signed`, are uploaded to S3, metadata appended, and status advances to `signed`.
    - `POST /:id/documents/unsigned/mark-signed`: moves unsigned document to signed collection programmatically.
    - `submitApplicationToBank` marks `sent_to_bank` and dispatches notifications.
- **Document Intelligence**
  - Document templates live in `templates/`; generated files go to `generated/` before S3 upload. `initializeDirectories` ensures disk paths exist.
  - The DocumentAgent extracts fields, calls `mapDataWithAI` to align applicant data with PDF inputs, and `fillPDFForm` writes outputs.
- **Email Automation**
  - `pollEmails()` uses `emailFetcher` to retrieve unread IMAP messages, `emailHandler` to craft AI replies with the EmailAgent, and `emailSender` (nodemailer) to send responses. Artifacts are persisted under `processed/emails/{drafts|threads}` for audit.
- **Voice and WebSocket Sync**
  - `POST /api/create-vapi-assistant`: creates Vapi assistant with predefined loan specialist persona using OpenAI `gpt-5-mini` model, configured with 8+ tool IDs for various capture functions (name, business info, financials, etc.).
  - `POST /vapi-ai`: webhook receiver handling Vapi events including `tool-calls`, `transcript`, `speech-update`, `end-of-call-report`. Uses `message.call?.id || message.chat?.id` fallback for identifying call/chat sessions. Implements extensive tool-call handlers for:
    - **Capture tools**: `captureUserName`, `captureBusinessName`, `capturePhoneNumber`, `captureCreditScore`, `captureYearFounded`, `captureAnnualRevenue`, `captureMonthlyRevenue/Expenses`, `captureRequestedLoanAmount`, `capturePurchasePrice`, `captureAvailableCash`, `captureIndustryExperience`, `captureLoanPurpose`, `captureUSCitizen`, and more. All values are trimmed for whitespace/newlines before processing.
    - **Checkbox tool**: `captureCheckboxSelection` handles checkbox field capture with validation against `CHECKBOX_GROUPS` config. Supports exclusive groups (entity, veteranStatus, sex, race, ethnicity) where only one can be selected, and non-exclusive groups (specialOwnershipType) allowing multiple selections. Maps user-friendly values to PDF field names and broadcasts `checkbox-selection` event with `groupCheckboxes` array for exclusive groups, enabling frontend to uncheck other options.
    - **Highlight tool**: `captureHighlightField` broadcasts field highlighting events to frontend.
    - **Eligibility calculator**: Integrated via `POST /api/applications/calculate-chances` which creates draft application, generates PDFs, and broadcasts results.
  - In-memory `userDataStore` maintains call-specific data; aggregated via `saveOrUpdateUserData()` function. TODO in code suggests moving to persistent database.
  - Transcript chunks are analyzed with an LLM in `main.ts`; extracted JSON fields are broadcast on `form-field-update` so dashboards keep forms synced in real time.
- **Chat Integration (ChatboxAgent)**
  - Text-based alternative to Vapi voice for loan application intake via REST API.
  - `POST /api/chat/sessions`: Creates a new chat session with unique `sessionId`, stored in MongoDB.
  - `POST /api/chat/sessions/:id/messages`: Sends user message, ChatboxAgent processes with OpenAI function calling, executes tool calls, broadcasts WebSocket events, returns AI response.
  - **Session storage**: MongoDB-backed `ChatSession` model stores full conversation history, captured `userData`, and optional `applicationId`.
  - **Tool execution**: Same capture tools as Vapi (23+ tools) implemented in `chatboxService.ts`. Each tool updates session `userData` in MongoDB and broadcasts WebSocket events.
  - **WebSocket events**: Same events as Vapi (`form-field-update`, `checkbox-selection`, `highlight-fields`) but with `source: 'chat'` and `sessionId` instead of `callId`.
  - **Function calling**: LLM automatically decides when to capture data based on user input. Tool definitions in `CHAT_TOOLS` array with OpenAI function schema format.

## Data and Storage
- Mongo collections house applications and banks. `Application` documents include:
  - `applicantData`: name, businessName, businessPhoneNumber, creditScore, yearFounded, isUSCitizen, userType (owner/buyer), and type-specific fields.
  - `loanChances`: score, chance (low/medium/high), reasons array calculated via eligibility functions.
  - `status`: tracks lifecycle from draft → submitted → processing → documents_generated → awaiting_signature → signed → sent_to_bank → under_review → approved/rejected/cancelled.
  - Document arrays: `unsignedDocuments`, `signedDocuments`, `userProvidedDocuments` (tax returns, P&L), `draftDocuments` (for preview).
  - `banks`: array of bank submissions with status tracking.
  - `offers`: loan offers from banks with acceptance/decline tracking.
  - Signing metadata: `signingProvider`, `signingRequestId`, `signingStatus`, `signedBy`, `signedDate`.
- S3 stores unsigned, signed, user-provided, and draft PDFs. Keys follow `applications/{applicationId}/{fileName}` for production docs and `drafts/{applicationId}/{fileName}` for draft previews. Local disk is only an intermediary and is purged after upload.
- Email JSON artifacts persist in `processed/emails/` for debugging and training.
- Vapi call data currently stored in-memory (`userDataStore` Map in `main.ts`) - should be migrated to database for production.

## API Conventions
- Responses follow `{ success: boolean, data?: T, error?: string }` for standard endpoints. Vapi webhook responses use `{ results: [{ toolCallId, result }] }` format for tool-call replies.
- Routes prefer TypeScript enums like `ApplicationStatus`, `UserProvidedDocumentType` (taxReturn, L&P), and `DefaultDocumentType` (SBA_1919, SBA_413); update both TypeScript definitions and Mongoose schemas together.
- Uploads use multer (memory storage) with PDF-only validation. Keep file-size limits (`10 MB`) aligned between front-end and server.
- Document retrieval endpoints support `expiresIn` query parameter (default 3600s) for presigned URL expiration control.
- Tool-call argument extraction uses helper functions (`extractToolCallArguments`, `extractBusinessName`, `extractBusinessPhone`) to handle varying payload structures from Vapi. All string arguments are trimmed for whitespace/newlines to handle malformed input.

## Checkbox Selection System
- **Configuration**: `CHECKBOX_GROUPS` in `pdfFormProcessor.ts` defines 6 checkbox groups with user-friendly values mapped to PDF field names:
  - **Exclusive groups** (only one selectable): `entity` (LLC, C-Corp, S-Corp, Partnership, Sole Proprietor, Other), `veteranStatus` (5 options), `sex` (Male, Female), `race` (6 options), `ethnicity` (3 options)
  - **Non-exclusive group** (multiple selectable): `specialOwnershipType` (ESOP, 401k, Cooperative, Native American Tribe, Other)
- **Vapi Integration**: `captureCheckboxSelection(group, value)` tool validates group and value, maps to PDF field name, stores in `userDataStore`, and broadcasts `checkbox-selection` WebSocket event
- **WebSocket Event Structure**: `{ callId, timestamp, fields: { [pdfFieldName]: true }, fieldType: 'checkbox', groupCheckboxes?: string[], source: 'toolfn-call' }`
  - `groupCheckboxes` array included only for exclusive groups, allowing frontend to uncheck all before checking selected one
  - Non-exclusive groups omit `groupCheckboxes`, enabling multiple simultaneous selections
- **Test Endpoint**: `POST /api/test-checkbox` mimics Vapi webhook structure for testing checkbox selection without voice calls

## AI Usage Guidelines
- Always access OpenAI via the LangChain helpers in `src/agents`. `processWithLLM` ensures consistent prompts, logging, and timeout handling.
- **Main.ts uses direct LangChain**: The `main.ts` file uses direct `ChatOpenAI` instantiation for voice assistant creation and transcript extraction (currently configured to use `gpt-5` model at line 70, temperature 0.7). This is an exception to the agent pattern for performance.
- When expanding prompts (for example, new document mappings or email strategies), constrain outputs to JSON if downstream code calls `JSON.parse`. The transcript extraction prompt explicitly requires valid JSON output with markdown cleanup logic.
- Respect concurrency and timeout settings configured in agents (`maxConcurrentTasks`, `timeout`). Propagate meaningful errors so services can degrade gracefully.
- **Eligibility Calculations**: Two distinct calculation functions exist for buyer vs owner flows (`calculateSBAEligibilityForBuyer`, `calculateSBAEligibilityForOwner`) with corresponding VAPI-formatted versions. These are rule-based (not LLM-based) and score based on credit, revenue, debt ratios, and business age.

## Observability and Ops
- Logging uses emoji prefixed statements (for example, check mark, warning) to trace async steps; match this style for new logs.
- Websocket broadcasts should always include the `global` room to keep dashboards in sync unless intentionally scoped.
- No automated tests exist; rely on manual REST calls or inspect artifacts in `processed/` and S3.
- When adding new status transitions, ensure `formatApplicationStatus` and any front-end consumers remain consistent.

## Key API Endpoints

### Application Management
- `POST /api/applications` - Create full application (requires all fields based on userType)
- `POST /api/applications/draft` - Create draft application (minimal validation)
- `PATCH /api/applications/:id/convert` - Convert draft to full application
- `PATCH /api/applications/:id/draft` - Upload edited PDF to draft
- `GET /api/applications/:id` - Get application with presigned document URLs
- `GET /api/applications` - List applications with pagination and status filtering
- `POST /api/applications/name` - Retrieve application by business name/phone (for Vapi)
- `POST /api/applications/calculate-chances` - Calculate SBA eligibility, create draft, generate PDFs

### Document Management
- `GET /api/applications/:id/documents/unsigned` - Get unsigned document URLs
- `GET /api/applications/:id/documents/signed` - Get signed document URLs
- `GET /api/applications/:id/documents/user-provided` - Get user-uploaded docs (tax returns, P&L)
- `GET /api/applications/:id/documents/draft` - Get draft preview PDFs
- `POST /api/applications/:id/documents/signed` - Upload signed documents
- `POST /api/applications/:id/documents/user-provided` - Upload user documents with fileType
- `POST /api/applications/:id/documents/unsigned/mark-signed` - Mark unsigned as signed
- `DELETE /api/applications/:id/documents/signed` - Delete signed document
- `GET /api/applications/documents/sample-contract` - Get sample contract presigned URL

### Bank & Offer Management
- `POST /api/applications/:id/submit-to-bank` - Submit application to bank partners
- `POST /api/applications/:id/offers` - Create loan offer from bank
- `PATCH /api/applications/:id/offers/:offerId` - Accept/decline offer

### Voice & Vapi Integration
- `POST /api/create-vapi-assistant` - Create Vapi voice assistant
- `POST /vapi-ai` - Webhook endpoint for Vapi events and tool calls (supports both call and chat sessions)
- `POST /api/test-checkbox` - Test endpoint for checkbox selection (mimics Vapi structure)

### Chat Integration
- `POST /api/chat/sessions` - Create new chat session
- `GET /api/chat/sessions/:id` - Get session with history and userData
- `POST /api/chat/sessions/:id/messages` - Send message, get AI response with tool results
- `DELETE /api/chat/sessions/:id` - Delete chat session
- `GET /api/chat/sessions/:id/messages` - Get message history
- `GET /api/chat/sessions/:id/userData` - Get captured user data

### Other
- `GET /health` - Health check

## Next Steps for Claude
- Explore `src/routes/applications.ts` and `src/services/applicationService.ts` for the most intricate business logic including draft flow, eligibility calculations, and document handling.
- Review `src/agents/EmailAgent.ts`, `DocumentAgent.ts`, and `ChatboxAgent.ts` for existing prompt patterns before introducing new LLM tasks.
- Study `main.ts` for the comprehensive Vapi webhook handler and tool-call implementations.
- For chat integration, see `src/routes/chatbox.ts`, `src/services/chatboxService.ts`, and `src/agents/ChatboxAgent.ts`.
- Use the established helpers (`uploadDocumentWithRetry`, `generatePresignedUrl`, `generateDraftPDFs`, etc.) instead of rolling bespoke integration code.
- Confirm any new environment variables are documented alongside the existing list and validated before use.
- Note the TODO in `main.ts` to migrate `userDataStore` from in-memory Map to persistent database (chat sessions already use MongoDB via `ChatSession` model).
