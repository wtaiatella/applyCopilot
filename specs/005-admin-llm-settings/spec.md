# Feature Specification: Admin LLM Model Configuration Panel

**Feature Branch**: `005-admin-llm-settings`  
**Created**: 2026-06-15  
**Status**: Draft  
**Input**: User description: "Add an admin settings screen to configure LLM providers and models for each AI capability (Default, Parsing, Summaries). Settings panel must be visible only to ADMIN users in the sidebar. Users with role ADMIN already exist in the system (role stored in User.role enum). Ensure the user wtaiatella@gmail.com is ADMIN. UI should show collapsible sections per feature group, starting with 'LLM Models' containing provider dropdowns for Default Provider, Parsing, and Summaries."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Configures LLM Providers (Priority: P1)

As an administrator, I want to configure which AI provider and model is used for each system capability (parsing, summaries, default), so I can control cost and quality without touching environment files or restarting the server.

**Why this priority**: This is the primary reason for the feature. Without it, changing providers requires direct database or environment access, which is not practical for day-to-day operations.

**Independent Test**: Log in as an ADMIN user, navigate to Settings in the sidebar, expand the "LLM Models" section, change the "Parsing" provider from Ollama to Gemini, save, then upload a CV — the system should use Gemini for parsing. Can be tested independently from any other admin feature.

**Acceptance Scenarios**:

1. **Given** I am logged in as a USER (non-admin), **When** I look at the sidebar navigation, **Then** the "Settings" menu item is not visible
2. **Given** I am logged in as an ADMIN, **When** I look at the sidebar navigation, **Then** I see a "Settings" link
3. **Given** I am on the Settings page, **When** the page loads, **Then** I see at least one collapsible section titled "LLM Models"
4. **Given** I expand the "LLM Models" section, **When** the section opens, **Then** I see three provider dropdowns: "Default Provider", "Parsing", and "Summaries"
5. **Given** I select "Gemini" as the Parsing provider, **When** I click Save, **Then** the system stores the selection and subsequent CV parse requests use the Gemini provider
6. **Given** I select a provider in any dropdown, **When** I save, **Then** a success confirmation is shown and the change is immediately active (no server restart required)
7. **Given** I am on the Settings page, **When** I click on the "LLM Models" section header, **Then** the section expands or collapses (accordion/collapsible behavior)

---

### User Story 2 — Admin Sees Available Providers and Requirements (Priority: P2)

As an administrator, I want to understand which API keys or environment variables are required for each provider, so I know what to configure before activating a provider.

**Why this priority**: Selecting a provider without having the required API key set will cause AI calls to fail silently. Informing the admin upfront prevents misconfiguration.

**Independent Test**: Open Settings → LLM Models, expand the section, observe that each provider option shows a clear indicator of whether its required credentials are configured (present in environment) or missing.

**Acceptance Scenarios**:

1. **Given** I am on the Settings page with "LLM Models" expanded, **When** I look at the provider dropdown options, **Then** each provider (Ollama, Gemini, Claude) is listed with a status indicator (e.g., "Configured ✓" or "Missing API key ⚠️")
2. **Given** the Gemini API key is not set in the environment, **When** I view the Gemini option, **Then** it is clearly marked as requiring configuration (with a tooltip or note explaining which environment variable is needed)
3. **Given** I hover over or click an info icon next to a provider option, **When** the tooltip appears, **Then** it lists the specific environment variable(s) required (e.g., `GEMINI_API_KEY` for Gemini, `CLAUDE_API_KEY` for Claude, `OLLAMA_BASE_URL` for Ollama)

---

### Edge Cases

- What happens if an admin selects a provider that has no API key configured and tries to save? → System allows saving but shows a warning that the selected provider may not function correctly
- What happens if the database becomes unavailable and settings cannot be loaded? → The page shows an error state; the system continues to function using environment variable fallbacks
- What if a non-admin user manually navigates to `/settings`? → They receive a 403 Forbidden response or are redirected to dashboard

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Settings page (`/settings`) MUST be accessible only to users with the ADMIN role; non-admin users attempting to access it MUST be redirected or shown a forbidden error
- **FR-002**: The sidebar navigation MUST show the "Settings" link only when the authenticated user has the ADMIN role
- **FR-003**: The Settings page MUST display at least one collapsible section; the first section MUST be titled "LLM Models"
- **FR-004**: The "LLM Models" section MUST contain three configuration fields: "Default Provider", "Parsing Provider", and "Summaries Provider", each rendered as a dropdown/select input
- **FR-005**: Each provider dropdown MUST offer at minimum three options: Ollama (local), Gemini, and Claude
- **FR-006**: The current values stored in the system (database or environment fallback) MUST be pre-loaded into each dropdown when the Settings page opens
- **FR-007**: When an admin saves the LLM Model settings, the new values MUST be persisted to the database `SystemConfig` table and take effect immediately for all subsequent AI calls (no restart required)
- **FR-008**: Each provider option MUST display a visual indicator of whether the required credentials are present in the environment (configured vs. unconfigured)
- **FR-009**: The Settings page MUST display, for each provider, the specific environment variable(s) required to activate it, accessible via tooltip or inline help text
- **FR-010**: Saving settings MUST provide user feedback (success notification or inline confirmation); failures MUST show a clear error message
- **FR-011**: The collapsible sections MUST support expand/collapse toggle behavior; the initial state SHOULD be collapsed

### Key Entities

- **SystemConfig**: Key-value store for portal-wide settings. Relevant keys: `AI_PROVIDER_DEFAULT`, `AI_PROVIDER_PARSING`, `AI_PROVIDER_SUMMARIES`, `OLLAMA_MODEL`, `GEMINI_MODEL`, `CLAUDE_MODEL`
- **User** (role): The `role` field (`USER` | `ADMIN`) on the User model determines sidebar visibility and page access
- **LLM Provider**: One of `ollama`, `gemini`, or `claude` — identifies the AI backend for a given capability
- **Credential Status**: Runtime check of whether the required environment variable for a given provider is non-empty and not a placeholder value

---

## Provider Environment Variable Reference

| Provider | Required Env Vars | Notes |
|----------|------------------|-------|
| **Ollama** | `OLLAMA_BASE_URL` (default: `http://localhost:11434`), `OLLAMA_MODEL` | Local; no API key required. Needs Ollama running |
| **Gemini** | `GEMINI_API_KEY`, `GEMINI_MODEL` (default: `gemini-1.5-flash`) | Google AI Studio key. Get at: https://aistudio.google.com/app/apikey |
| **Claude** | `CLAUDE_API_KEY`, `CLAUDE_MODEL` (default: `claude-3-5-sonnet-latest`) | Anthropic API key. Get at: https://console.anthropic.com/settings/keys |

> **Note**: The `GEMINI_API_KEY` in the current `.env` is set to `"your-gemini-api-key-here"` (placeholder). `CLAUDE_API_KEY` is not yet defined in `.env`. These must be provided for those providers to function.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An ADMIN user can change the active provider for any AI capability and the change takes effect within 5 seconds — without restarting any server process
- **SC-002**: A non-ADMIN user cannot access the Settings page under any circumstance (direct URL or navigation)
- **SC-003**: The Settings page loads and displays current configuration values within 2 seconds
- **SC-004**: The provider credential status indicator is accurate — it correctly shows "configured" only when the environment variable contains a non-empty, non-placeholder value
- **SC-005**: After saving, at least one AI capability (e.g., CV parsing) uses the newly selected provider on the very next request

---

## Assumptions

- The `SystemConfig` table already exists in the PostgreSQL database with the six AI configuration keys pre-populated (confirmed present in current DB)
- The `User.role` enum (`USER` | `ADMIN`) already exists in the Prisma schema (confirmed)
- The user `wtaiatella@gmail.com` has been promoted to ADMIN role in the database (done as part of this feature delivery)
- The Settings page is a new page under the existing `(main)` route group — it reuses the sidebar + header layout already implemented
- Ollama does not require an API key; it requires only the base URL and model name to be set, and the Ollama service must be running locally
- The provider and model selection in the UI map 1:1 to the `SystemConfig` keys already consumed by `aiClient.ts`
- Mobile support for the Settings page is not required in this phase
- Model name input (free text) is out of scope for this phase — only provider selection via dropdown is required; model keys remain editable only via environment variables or direct DB

