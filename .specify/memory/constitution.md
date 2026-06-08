# ApplyCopilot Constitution

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)
Every feature begins with a specification before any code is written.
- `spec.md` defines WHAT and WHY — product perspective, technology-agnostic
- `plan.md` defines HOW — technical decisions, architecture, dependencies
- `tasks.md` defines the execution steps — atomic, trackable, testable
- Technical details in `spec.md` are a blocker for merge
- No implementation starts without an approved spec

### II. Trunk-Based Development
The project follows a trunk-based branching strategy:
- `main` is the single source of truth and always deployable
- Feature branches are short-lived (max 2 days before merge)
- All commits follow **Conventional Commits** standard:
  - `feat:` new features
  - `fix:` bug fixes
  - `chore:` maintenance tasks
  - `docs:` documentation changes
  - `test:` test additions or fixes
  - `refactor:` code restructuring without behavior change
- Direct commits to `main` are forbidden — always use a feature branch + PR

### III. Pragmatic Testing (NON-NEGOTIABLE)
Unit and integration tests must be written and maintained as the project evolves:
- **Unit Tests (Jest):** Coverage for business logic, helpers, and data-flow utilities.
- **Integration Tests:** Testing of third-party boundaries (AI routing, Resend, PostgreSQL, and NextAuth).
- **Execution Policy**: While test suites do not need to be complete or run on every single intermediate commit, they MUST be fully verified, updated, and passing at the delivery of each main feature/deliverable (prior to merging a Merge Request / Pull Request).
- **Minimum coverage: 80%** — PR merges for deliverables below this threshold are blocked.

### IV. English-Only Codebase
All code artifacts must be written exclusively in English:
- Variable names, function names, class names
- Code comments and inline documentation
- Commit messages and PR descriptions
- Spec, plan, and task files
- API routes, database field names, and type definitions

### V. AI Cost Optimization (NON-NEGOTIABLE)
The AI processing pipeline is built as a configurable multi-provider router supporting local models (Ollama) and premium models (Gemini, Claude):
1. **TensorFlow.js** — mathematical pre-filtering (free, local)
2. **Ollama (local LLM)** — structured parsing and simple transformations (free, local)
3. **Premium AI (Gemini/Claude API)** — only for high-complexity tasks or when selected by configuration (paid)
- The active provider for each AI capability (e.g., CV parsing, summary generation) is dynamically configurable via environment variables (`.env`) or database-backed settings in the Admin panel.
- To minimize cost, features should default to local models (Ollama) unless complexity requirements or administrator configurations dictate a premium tier.

### VI. Privacy by Default
Sensitive user data should be processed locally whenever possible:
- CV parsing and initial profile extraction: local (Ollama) by default, with opt-in/configured overrides to Gemini/Claude.
- Pre-filtering of job compatibility: local only (TensorFlow.js)
- Data sent to external APIs must be minimized and documented in `plan.md`

### VII. UI Consistency (Ant Design + Tailwind CSS)
- Ant Design 6 is the primary component library — do not reinvent UI primitives
- Tailwind CSS 4 is used exclusively for layout, spacing, and custom styling
- **Dark mode is the default and priority** — all components must support dark/light themes
- Use Ant Design's built-in theme system (`ConfigProvider`) for theming
- No custom color values outside the Ant Design token system unless explicitly justified

### VIII. Standardized Logging & Auditing (NON-NEGOTIABLE)
All backend components must use structured, centralized logging via Winston:
- **Console Output**: Levels `INFO`, `WARN`, and `ERROR` must log directly to the server terminal.
- **Debug Tracing**: `DEBUG` level messages must trace inputs and outputs of key pipeline stages (e.g., CV parsing phases).
- **Payload Auditing**: In development mode (when `LOG_LEVEL=debug`), API payloads, responses, and LLM call parameters must be saved in the `/debug` directory as flat, chronological files using the format: `YYYY-MM-DD-HH-mm-ss-<requestId>-<description>.<ext>`.
- **Global Log File**: In development mode with `LOG_LEVEL=debug`, if the environment variable `DEBUG_SAVE_EXTRACTED_TEXT="true"` is enabled, all application logs must also be written to a `debug/global.log` file.

## Security Requirements

### Credential Handling (NON-NEGOTIABLE)
**NEVER store credentials, auth tokens, API keys, or any sensitive artifacts in:**
- `.windsurf/` folder or any agent configuration folder
- `.specify/` templates or memory files
- `specs/` files or any tracked markdown files
- Any file that may be committed to version control

**Always request that sensitive values be stored in a dedicated file:**
```
.env.agent       ← agent-specific secrets
.env.local       ← local development secrets
.env             ← non-sensitive defaults only
```

Example `.env.agent` structure:
```env
GEMINI_API_KEY=your_key_here
CLAUDE_API_KEY=your_key_here
NEXTAUTH_SECRET=your_secret_here
MONGODB_URL=your_url_here
RESEND_API_KEY=your_key_here
```

Always ensure `.gitignore` contains:
```
.env.agent
.env*.local
*.token
*.secret
```

### Authentication
- NextAuth.js is the sole authentication solution
- Supported providers: **Credentials (email/password)**, **Google**, **GitHub**
- No custom auth implementations outside NextAuth.js

## Development Workflow

### Environment Strategy
- **Single environment: `dev` (Docker local)**
- Future migration target: Akamai bare-metal server
- Docker Compose manages all local services (Next.js, PostgreSQL, Ollama)
- No staging or production environment until explicitly defined

### Folder Structure (Enforced)
```text
/
├── .agent/                    ← Agent rules and custom skills
├── .specify/                  ← Spec-Driven Development (speckit) configurations, templates, and memory
├── .windsurf/                 ← Windsurf agent configurations (NO SECRETS)
├── cv/                        ← Resumes/CVs for testing and parsing configuration
├── frontend/                  ← Unified Next.js 16 project
│   ├── src/
│   │   ├── app/               ← Pages, API Routes, Server Actions
│   │   ├── components/        ← Ant Design/Tailwind UI Components
│   │   ├── lib/               ← TensorFlow, Ollama, Prisma configs, central UI theme, proxy
│   │   ├── services/          ← External API integrations
│   │   └── types/             ← Zod/TypeScript definitions
│   ├── prisma/                ← PostgreSQL Schema and Prisma ORM
│   ├── tests/                 ← Automated tests (Jest for unit/integration, Playwright for e2e)
│   └── tests_scripts/         ← Frontend-specific development & helper scripts
├── mydocs/                    ← Backlog, product description, project documentation, and old versions
├── specs/                     ← SpecKit folder for feature specifications (WHAT & WHY)
└── tests_scripts/             ← Root-level development & helper scripts
```

### Script Placement Policy
During development, any scripts generated to test, seed, debug, or assist with a specific feature or functionality must be placed in one of the designated script folders:
- **Root scripts:** Global, docker entrypoint, or backend/database seeding/scraping helper scripts go into `/tests_scripts/`.
- **Frontend scripts:** Scripts specifically assisting with React, Next.js, UI, or local client-side functions go into `/frontend/tests_scripts/`.
- **Standard:** Always give scripts descriptive names and add comments detailing their purpose. Never leave auxiliary or temporary scripts in the root directory or in general source code folders (`src/`, etc.).

### Documentation Separation of Concerns
- **`spec.md` — Product Perspective (What & Why)**
  - MUST remain technology-agnostic
  - NO implementation details, frameworks, or libraries
  - Focus: User Stories, Requirements, Acceptance Criteria
- **`plan.md` — Engineering Perspective (How)**
  - Contains ALL technical decisions
  - Specifies frameworks, libraries, architecture patterns
  - Documents AI tier justification for every AI feature
- **`tasks.md` — Execution (Steps)**
  - Atomic, independently executable tasks
  - Each task maps to a testable outcome

## Governance

- This constitution supersedes all other practices and conventions
- All PRs must verify compliance with these principles before merge
- Amendments require: documentation of the change, rationale, and update to this file
- Complexity must be justified — prefer simple solutions (YAGNI)
- Use `.specify/memory/` for runtime development guidance and project context

**Version**: 1.0.1 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-05-22
