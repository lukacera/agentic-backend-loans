# Torvely Backend – Copilot Instructions

## Architecture
- Express entrypoint in `src/main.ts` wires routers, loads env with `dotenv`, connects Mongo via `mongoose.connect`, starts the IMAP poller, and initializes Socket.IO through `services/websocket.ts`.
- Feature routers live under `src/routes`, delegate to service modules, and return JSON envelopes `{ success, data|error }` that downstream code expects.
- AI logic sits in `src/agents`; each agent wraps LangChain `ChatOpenAI` through `agents/BaseAgent.ts` so new prompts should also flow through `processWithLLM` for logging and consistent config.
- Mongoose models (currently `src/models/Application.ts`) define persisted shape; update enums in `src/types/index.ts` whenever adding new status-like fields.

## Core Flows
- SBA application lifecycle is driven by `services/applicationService.ts`: creation stores applicant data, spawns `processApplicationAsync` to build PDFs, uploads to S3, updates status, and later emails signed docs to the bank.
- Unsigned/signed document endpoints in `routes/applications.ts` call service helpers that mutate `Application` arrays and rely on S3 helpers (`uploadDocumentWithRetry`, `deleteDocument`, `generatePresignedUrl`).
- Email automation flows through `services/poller.ts` → `services/emailFetcher.ts` → `services/emailHandler.ts`, which generates replies via the EmailAgent and sends them using `services/emailSender.ts`.
- Document tooling under `routes/docs.ts` couples PDF analysis/extraction (`services/pdfFormProcessor.ts`) with the DocumentAgent for AI-assisted field mapping before saving filled PDFs to disk/S3.
- Webhook-style Vapi events hit `main.ts` and get rebroadcast over websockets via `services/websocket.ts`; rooms default to `global` plus `call.id` when present.

## Storage & Integrations
- Local artifacts land in `generated/`, `processed/`, and `uploads/`; initialization helpers (`initializeDirectories`, `initializePDFDirectories`, `initializeEmailStorage`) must run before reading/writing.
- S3 uses `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`; keys follow `applications/{applicationId}/{fileName}` via `generateS3Key`.
- Email polling needs `IMAP_*` env vars; outbound email relies on `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- AI services require `OPENAI_API_KEY`; voice assistant features also depend on `VAPI_API_KEY` for `VapiClient` and ElevenLabs voice IDs embedded in `main.ts`.
- Mongo defaults to `mongodb://localhost:27017/torvely_ai`; override with `MONGODB_URI` in `.env` when deploying.

## Development Workflow
- Install deps with `npm install`; start the TypeScript watcher using `npm run dev` (tsx) for hot reload, or build once via `npm run build` then `npm start` for compiled output.
- Run the server from workspace root so relative `process.cwd()` paths for templates/uploads resolve correctly.
- Seed expected directories (`templates/`, `generated/`, `processed/`) or copy production assets before exercising document routes locally.
- No automated tests exist; verify flows manually via REST clients or by inspecting `processed/emails` artifacts and S3 uploads.

## Patterns & Conventions
- Prefer updating service-layer functions (e.g., `applicationService.ts`) instead of embedding business logic in routers to keep request handlers thin.
- Maintain `ApplicationStatus` transitions: only `createApplication` should move to `PROCESSING`, document generation sets `AWAITING_SIGNATURE`, signing APIs move to `SIGNED`, and bank submission uses `SENT_TO_BANK`.
- When expanding LLM prompts, stick to JSON-only responses where current code expects `JSON.parse` (see `mapDataWithAI`, transcript extraction in `main.ts`).
- Reuse `uploadDocumentWithRetry` and `downloadDocument` for S3 IO; they already instrument retries and logging—avoid duplicating AWS SDK calls in new code.
- Email content is persisted as JSON in `processed/emails`; when adding new metadata, adjust both the draft/message schemas in `services/emailProcessor.ts` and the corresponding TypeScript interfaces.
- Logging intentionally includes emojis/emphasis (e.g., `✅`, `⚠️`); keep new logs concise and structured so operators can trace async flows across pollers, webhooks, and background tasks.
