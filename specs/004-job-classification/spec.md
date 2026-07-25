# Feature Specification: Job Classification & Semantic Matching

**Feature Branch**: `004-job-classification`  
**Created**: 2026-07-07  
**Status**: Draft  
**Input**: User description: "Definição conjunta de classificação de vagas em dois níveis (Two-Stage / Hybrid Ranking). Uso de modelo de vetorização local de 512 dimensões (Universal Sentence Encoder com TensorFlow.js) integrado à pesquisa do pgvector no PostgreSQL. Extração de fichas técnicas de vagas e perfil via IA (LLM) para remoção de ruídos. Atualização manual controlada do perfil do usuário por botão Sincronizar IA na tela de profile. Exibição de pontuação de compatibilidade (Match %) e análise profunda (pontos fortes, fracos e lacunas) sob demanda com cache de banco de dados."

---

## Clarifications

### Session 2026-07-07
- Q: Se o usuário nunca sincronizou o perfil com a IA (UserProfile.embedding = null), qual o comportamento de /jobs e nota de compatibilidade? → A: O sistema exibe as vagas ordenadas por data de publicação/criação, e exibe uma etiqueta informativa (ex: "Sincronizar IA") no lugar da porcentagem de match.
- Q: Como o painel /jobs deve gerenciar e limitar o processamento de muitas vagas no cálculo dinâmico de match? → A: O cálculo será restrito por padrão a vagas publicadas nos últimos 15 dias, configurável na tela por um filtro de dias e com um botão "Update Job List" para atualizar a busca.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Perfil Profissional: Sincronização Manual de IA (Priority: P1)

As a candidate, I want to control when my professional profile is processed by the AI and vectorized, so that the system remains updated with my latest experiences without generating unnecessary AI costs or processing overhead for every single typo correction.

**Why this priority**: Avoids excessive AI token usage and database processing while ensuring the user always knows exactly when their matching data is up to date.

**Independent Test**: Can be fully tested by making changes to profile data (e.g. editing a skill name), verifying that the UI flags the AI status as "Out of Date", clicking "Sync with AI", and seeing the status update to "Synced" along with the current timestamp.

**Acceptance Scenarios**:

1. **Given** I edit my work experience, education, or projects in the profile tab, **When** the changes are auto-saved in the background, **Then** the textual changes are updated in the database, but the semantic vector remains unchanged, and the UI displays an "IA Profile Index Out of Date" warning alongside the "Saved" background indicator.
2. **Given** my IA profile index is flagged as out of date, **When** I click the "Sync with AI" button, **Then** the system sends a request to clean the profile using the configured LLM, computes the local 512-dimension vector, updates the database record, and displays "IA Profile Synced" with the current timestamp.

---

### User Story 2 - Classificação de Vaga: Worker de Segundo Plano (Priority: P1)

As a system background worker, I want to automatically clean and classify newly scraped jobs, so that we have high-quality, noise-free semantic representations of each job description for accurate matching.

**Why this priority**: Cleaning raw job descriptions (removing corporate benefits, company history, and boilerplate text) is critical for high-precision vector comparisons.

**Independent Test**: Can be fully tested by inserting a raw job description with high noise, triggering the worker, and verifying that a structured, noise-free summary and its corresponding 512-dimension vector are saved to the database.

**Acceptance Scenarios**:

1. **Given** a job listing with a full description fetched (`isFullDescriptionFetched = true`) and classification status set to `PENDING`, **When** the background worker triggers, **Then** it requests the configured LLM to extract a standardized technical summary (required skills, years of experience, remote status, core technologies) and filters out corporate noise.
2. **Given** the clean technical summary is returned by the LLM, **When** the worker processes it, **Then** it generates a 512-dimension vector using the local vectorization engine, saves the vector and clean summary in the database, and marks the job classification status as `COMPLETED`.

---

### User Story 3 - Painel de Vagas: Ordenação por Match Semântico (Priority: P1)

As a candidate, I want to view a list of all scraped job listings sorted by their compatibility score with my profile, so that I can immediately focus my application efforts on the most matching positions.

**Why this priority**: Essential interface for job discovery. Sorting by semantic match drastically reduces time spent filtering irrelevant listings.

**Independent Test**: Can be fully tested by opening the Job Panel, seeing a list of vacancies with color-coded "Match %" badges, and checking if the sorting changes correctly when sorting by "Highest Match" vs "Most Recent".

**Acceptance Scenarios**:

1. **Given** I have a synced profile and there are classified jobs in the database, **When** I access the job listing page, **Then** the page loads the jobs ordered by highest match score, displaying a clear percentage badge (e.g., "85% Match") calculated using vector similarity.
2. **Given** the list of sorted vacancies, **When** I apply filters (such as Remote only, or Location), **Then** the system filters the results on the database level while maintaining the descending match score ordering.

---

### User Story 4 - Análise Profunda de Vaga Sob Demanda (Priority: P2)

As a candidate, I want to request a deep analysis of a specific job, so that I can see the exact strengths, weaknesses, skill gaps, and a detailed recommendation regarding my candidacy.

**Why this priority**: Deep analysis requires a significant amount of LLM tokens and time. Doing it on-demand avoids wasting API costs on jobs the user does not care about.

**Independent Test**: Can be fully tested by opening a job's details, clicking "Analyze with AI", seeing a detailed breakdown load, closing it, opening it again, and verifying it loads instantly without calling the LLM API again.

**Acceptance Scenarios**:

1. **Given** I am viewing a job's details panel, **When** I click the "Analyze with AI" button, **Then** the system sends the raw profile and raw job description to the LLM, generates a comprehensive report (strengths, weaknesses, missing requirements, candidacy verdict), and displays it on the screen.
2. **Given** a job has already been analyzed once, **When** I click to view its details again, **Then** the system retrieves the analysis from the cache table, rendering it instantly without trigger-happy LLM calls.

---

### Edge Cases

- **Empty Profile Sync**: If the user clicks "Sync with AI" but has no skills or work experience registered, the system displays a friendly validation message: "Please fill in at least one skill or experience before syncing with the AI."
- **LLM Rate Limits / Failures during Background Classification**: If a call to a configured LLM provider fails due to rate limiting (HTTP 429), quota limits, or server errors, the classification task is NOT set to `FAILED`. Instead, the vacancy remains as `PENDING`, and the system automatically flags that specific LLM provider as `BLOCKED` to protect API endpoints. The classification worker will skip pending tasks for blocked providers.
- **Out of Date Vacancies**: If a user updates their profile and syncs it, the match scores of all vacancies update dynamically on the next database query. Vacancies do not need to be reclassified because the vacancy vector remains stable; only the candidate's vector changed.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a local vectorization model of **512 dimensions** running on the Node.js server to convert cleaned profiles and cleaned job summaries into vectors.
- **FR-002**: System MUST implement a manual synchronization interface in the User Profile settings, tracking the synchronization status (`Synced`, `Out of Date`, `Not Synced`) and the timestamp of the last generation. The profile cleaning step MUST call the LLM configured in the "Summaries Provider" (`AI_PROVIDER_SUMMARIES` key in `SystemConfig`) before vectorization.
- **FR-003**: System MUST execute a background classification worker that processes jobs sequentially (or with controlled concurrency):
  - Checks if the configured "Parsing Provider" LLM is `BLOCKED`. If blocked, the worker skips the classification run.
  - Fetches listings where `isFullDescriptionFetched = true` and `classificationStatus = PENDING`.
  - Cleans the raw job description by calling the LLM configured in the "Parsing Provider" (`AI_PROVIDER_PARSING` key in `SystemConfig`) to extract a technical structured summary.
  - Converts the technical summary into a 512-dimension vector using the local vectorization engine.
  - Updates the listing record with the vector, clean summary, and sets `classificationStatus = COMPLETED`.
- **FR-004**: System MUST perform dynamic semantic similarity calculations (cosine similarity) directly inside the database queries when loading the job listing page to rank vacancies. To optimize performance, the database query MUST filter vacancies by publication date (default: last 15 days, but dynamically configurable) before calculating match scores. If the user's profile embedding is null, the query MUST fallback to sorting jobs by creation/post date descending.
- **FR-005**: System MUST provide a new user interface route (e.g., `/jobs`) to display vacancies with dynamic match badges and control filters:
  - Display dynamic match badges: High Match (Green, `>= 80%`), Medium Match (Yellow, `60% - 79%`), Low Match (Gray, `< 60%`), and Un-synced Profile (Gray label: "Sync Profile").
  - Include a configuration filter for publication date range (in days, defaulting to last 15 days).
  - Include an "Update Job List" button to re-trigger the query and refresh the list with the selected filter.
- **FR-006**: System MUST implement an on-demand Deep Analysis endpoint (`POST /api/jobs/:id/analyze`) that evaluates raw profile data against a raw job description using the LLM configured in the "Summaries Provider" (`AI_PROVIDER_SUMMARIES` key in `SystemConfig`) or "Default Provider" (`AI_PROVIDER_DEFAULT` key), persisting the result in a cache table.
- **FR-007**: System MUST bypass LLM execution and load the cached analysis from the database whenever a user requests a deep analysis that was previously generated.
- **FR-008**: System MUST implement a "Circuit Breaker" mechanism for LLM providers. If an API request to a provider returns a critical error (such as HTTP 429 rate limit, 401 unauthorized, or 402 quota exceeded), the system MUST mark that provider's status as `BLOCKED` in `SystemConfig` for a configurable cooldown period (default: 1 hour).
- **FR-009**: System MUST update the "LLM Models" panel inside the Administration Settings page to show the status of each provider (`Healthy`, `Blocked`, or `Not Configured`) and provide a "Reset Provider" action/button next to any blocked provider to allow manual unblocking.

### Key Entities *(include if feature involves data)*

- **UserProfile**: Represents the candidate. Extended with:
  - `embedding`: A 512-dimension vector (`Unsupported("vector(512)")`) storing the semantic representation of the clean profile.
  - `aiCleanedText`: The raw text summary of the profile produced by the LLM before vectorization.
  - `embeddingSyncedAt`: DateTime tracking the last successful vectorization sync.
- **JobListing**: Represents the scraped job. Extended with:
  - `embedding`: A 512-dimension vector (`Unsupported("vector(512)")`) storing the semantic representation of the clean technical summary.
  - `cleanedSummary`: The text summary produced by the LLM before vectorization.
  - `classificationStatus`: Enum (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`).
- **JobAnalysis**: Represents the cached deep analysis of a vacancy. Attributes:
  - `id`: Unique identifier.
  - `jobId`: Relation to `JobListing`.
  - `strengths`: String list/text detailing match alignments.
  - `weaknesses`: String list/text detailing non-alignments.
  - `missingSkills`: String list of skills requested but absent.
  - `verdict`: Enum/Recommendation (Apply, Caution, Ignore) and justification text.
  - `createdAt`: Timestamp.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Semantic matching query on the database must rank and sort 1,000 vacancies in under 300 milliseconds.
- **SC-002**: Local vector generation using the local model must execute in under 1 second per item on standard server CPU resources.
- **SC-003**: 100% of jobs previously analyzed load their deep analysis reports in under 100 milliseconds when requested again by the user.
- **SC-004**: The background classification worker must process a job (LLM clean + local vectorize) in under 8 seconds under normal API load.

---

## Assumptions

- The PostgreSQL database has the `pgvector` extension installed/enabled.
- The local server has sufficient CPU memory (at least ~100MB free RAM) to load the lightweight 512-dimension vectorization model.
- The user is responsible for manually triggering the profile synchronization when they wish their matching results to reflect recent CV updates.
- External LLM API calls utilize the existing providers configured in the Admin LLM Configuration Panel (`SystemConfig` table), avoiding hardcoded model selections and reusing "Parsing Provider" for vacancy cleaning, and "Summaries Provider" for profile cleaning and deep analysis.
