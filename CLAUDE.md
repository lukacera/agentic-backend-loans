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
- **Entry (`src/main.ts`)**: loads env, initializes Mongo, sets up Express, CORS, JSON parsing, routers (`/api/docs`, `/api/emails`, `/api/applications`, `/api/banks`), WebSocket layer (`services/websocket.ts`), and kicks off the IMAP poller (`services/poller.ts`). Also exposes a minimal chat chain, voice assistant creation endpoint, and transcript analysis that broadcasts JSON field updates over websockets.
- **Routers (`src/routes`)**: thin controllers returning `{ success, data | error }`. They delegate to service logic and enforce validation (see `routes/applications.ts` for detailed parsing of AI tool-call payloads).
- **Services (`src/services`)**:
  - `applicationService.ts`: canonical pipeline for SBA applications; generates forms, uploads to S3, tracks status transitions, handles signed docs, user uploads, bank submissions, and SBA eligibility calculators.
  - `pdfFormProcessor.ts` plus `documentProcessor.ts`: extract PDF form fields, map applicant data via the DocumentAgent, fill forms with `pdf-lib`, and persist metadata to disk.
  - `emailFetcher.ts` -> `emailHandler.ts` -> `emailSender.ts`: polls IMAP, summarizes messages with the EmailAgent, optionally responds via SMTP, and stores structured artifacts under `processed/emails`.
  - `poller.ts`: schedules inbox polling (default every 20 seconds) and hands replies to the sender.
  - `s3Service.ts`: wraps AWS SDK with retrying uploads, presigned URLs, delete/list helpers. Keys follow `applications/{applicationId}/{fileName}`.
  - `websocket.ts`: manages Socket.IO rooms (`global` plus per-call rooms), rebroadcasts Vapi events, and supports transcript-derived form field pushes.
- **Agents (`src/agents`)**: `BaseAgent.ts` centralizes LangChain setup via `processWithLLM`. `DocumentAgent` and `EmailAgent` build on it for domain-specific prompts and storage helpers. New LLM flows should route through these helpers for consistent logging and throttling.
- **Models (`src/models`)**: Mongoose schemas (`Application.ts`, `Bank.ts`) aligned with TypeScript contracts in `src/types/index.ts`. Update enums (for example, `ApplicationStatus`) whenever introducing new lifecycle states.
- **Utilities (`src/utils`)**: `formatters.ts` formats application status snapshots for voice agent responses.

## Core Flows
- **SBA Application Intake**
  - `POST /api/applications`: validates payload, calls `createApplication()` which stores applicant data, marks status `submitted`, and asynchronously triggers `processApplicationAsync`.
  - `processApplicationAsync`: bumps status to `processing`, generates SBA PDFs (`SBAForm1919`, `SBAForm413`) via DocumentAgent plus PDF filling, uploads unsigned docs to S3, updates status to `awaiting_signature`, and cleans local artifacts.
  - Signed docs arrive through `handleSignedDocuments`, are uploaded to S3, metadata appended, and status advances to `signed`. `submitApplicationToBank` later marks `sent_to_bank` and dispatches notifications.
- **Document Intelligence**
  - Document templates live in `templates/`; generated files go to `generated/` before S3 upload. `initializeDirectories` ensures disk paths exist.
  - The DocumentAgent extracts fields, calls `mapDataWithAI` to align applicant data with PDF inputs, and `fillPDFForm` writes outputs.
- **Email Automation**
  - `pollEmails()` uses `emailFetcher` to retrieve unread IMAP messages, `emailHandler` to craft AI replies with the EmailAgent, and `emailSender` (nodemailer) to send responses. Artifacts are persisted under `processed/emails/{drafts|threads}` for audit.
- **Voice and WebSocket Sync**
  - Vapi webhooks hit `POST /api/create-vapi-assistant` and generate assistants that leverage OpenAI tools.
  - Transcript chunks are analyzed with an LLM in `main.ts`; extracted JSON fields are broadcast on `form-field-update` so dashboards keep forms synced in real time.

## Data and Storage
- Mongo collections house applications and banks. `Application` documents include applicant info, S3 document metadata, status trail, offers, and signing metadata.
- S3 stores both unsigned and signed PDFs. Local disk is only an intermediary and is purged after upload.
- Email JSON artifacts persist in `processed/emails/` for debugging and training.

## API Conventions
- Responses follow `{ success: boolean, data?: T, error?: string }`. Maintain this envelope when adding endpoints.
- Routes prefer TypeScript enums like `ApplicationStatus` and `UserProvidedDocumentType`; update both TypeScript definitions and Mongoose schemas together.
- Uploads use multer (memory storage) with PDF-only validation. Keep file-size limits (`10 MB`) aligned between front-end and server.

## AI Usage Guidelines
- Always access OpenAI via the LangChain helpers in `src/agents`. `processWithLLM` ensures consistent prompts, logging, and timeout handling.
- When expanding prompts (for example, new document mappings or email strategies), constrain outputs to JSON if downstream code calls `JSON.parse`.
- Respect concurrency and timeout settings configured in agents (`maxConcurrentTasks`, `timeout`). Propagate meaningful errors so services can degrade gracefully.

## Observability and Ops
- Logging uses emoji prefixed statements (for example, check mark, warning) to trace async steps; match this style for new logs.
- Websocket broadcasts should always include the `global` room to keep dashboards in sync unless intentionally scoped.
- No automated tests exist; rely on manual REST calls or inspect artifacts in `processed/` and S3.
- When adding new status transitions, ensure `formatApplicationStatus` and any front-end consumers remain consistent.

## Next Steps for Claude
- Explore `src/routes/applications.ts` and `src/services/applicationService.ts` for the most intricate business logic.
- Review `src/agents/EmailAgent.ts` and `DocumentAgent.ts` for existing prompt patterns before introducing new LLM tasks.
- Use the established helpers (`uploadDocumentWithRetry`, `generatePresignedUrl`, and similar) instead of rolling bespoke integration code.
- Confirm any new environment variables are documented alongside the existing list and validated before use.
