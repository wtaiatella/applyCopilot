# Implementation Tasks: ApplyCopilot Job Search Automation System

**Branch**: `001-apply-copilot-system` | **Date**: 2025-06-17  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: Project Setup

### Goal
Initialize Next.js 16 project with required dependencies, configuration, and development environment.

### Independent Test Criteria
- Project builds successfully without errors
- All dependencies installed and configured
- Development server starts on localhost:3000
- Database connection established
- AI services accessible

### Implementation Tasks

- [X] T001 Initialize Next.js 16 project with TypeScript
- [X] T002 Install and configure core dependencies (React 19, Ant Design 6, Tailwind CSS 4)
- [X] T003 Install and configure database dependencies (Prisma, MongoDB)
- [ ] T003a Install and configure AWS SDK for S3 file storage (ApplyCopilot bucket)
- [X] T004 Install and configure AI dependencies (TensorFlow.js, Ollama SDK)
- [X] T005 Install testing dependencies (Jest, Playwright, Testing Library)
- [X] T006 Configure environment variables and .env files
- [X] T007 Set up Prisma schema and generate client
- [X] T008 Configure NextAuth.js with credentials provider
- [X] T009 Set up Docker Compose for local services (MongoDB, Redis, Ollama)
- [X] T010 Configure ESLint, Prettier, and TypeScript settings
- [X] T011 Set up project folder structure per implementation plan
- [X] T012 Create initial Git repository and commit structure

## Phase 2: Foundational Infrastructure

### Goal
Implement core infrastructure components required by all user stories.

### Independent Test Criteria
- Authentication system functional (signup/signin)
- Database operations working
- API routing framework ready
- Error handling implemented
- Logging and monitoring configured

### Implementation Tasks

- [X] T013 Create Prisma schema for all entities (User, UserProfile, JobListing, etc.)
- [X] T013a [P] Extend Prisma schema with `PortalMonitor` (global URLs/intervals) and `JobMatch` (user-specific cached scores)
- [X] T014 Implement database connection and client configuration
- [X] T015 Create authentication middleware and session management
- [X] T016 Implement API error handling and response formatting
- [X] T017 Set up logging with Winston
- [X] T018 Configure rate limiting middleware
- [X] T019 Create input validation schemas with Zod
- [ ] T020 Implement file upload handling and AWS S3 integration for CV files
- [X] T021 Set up AI service clients (Ollama, Gemini)
- [X] T022 Configure TensorFlow.js for compatibility scoring
- [X] T023 Create base API route structure
- [X] T024 Implement health check and monitoring endpoints
- [X] T025 Install and configure Resend API for email delivery
- [X] T026 Install and configure Twilio WhatsApp Business API
- [X] T027 Create email service layer in frontend/src/lib/email/
- [X] T028 Create notification queue system for retry logic
- [X] T029 Implement password reset flow with secure tokens
- [X] T030 Create welcome email template and trigger on registration
- [X] T031 Implement job match notification email service
- [X] T031a Implement Resend webhook endpoints to capture email delivery/bounce events into NotificationLog
- [X] T032 Create WhatsApp notification service for critical alerts
- [ ] T032a Implement fallback logic to email when WhatsApp delivery fails
- [X] T033 Build notification preferences management UI
- [ ] T033b Create unsubscribe API endpoint with 24-hour processing guarantee
- [X] T033a Create Ant Design theme configuration file
  - Create `frontend/src/lib/theme.ts` with centralized ThemeConfig
  - Define dark mode as default (theme.darkAlgorithm)
  - Configure all color tokens (primary, hover, active states)
  - Export theme for use in ConfigProvider
  - Update `registry.tsx` to import theme from @/lib/theme
  - Update `globals.css` with theming policy documentation
  - **Rationale**: Establishes single source of truth for Ant Design theming per UI Theming Strategy in plan.md
- [X] T033c Build Login and Registration UI pages in frontend/src/app/auth/
- [X] T033d Implement Password Recovery UI flow (Forgot Password & Reset Password pages)
- [X] T033e Implement Email Validation UI flow (Verification page & resend link)

## Phase 3: User Story 1 - Profile Setup and CV Processing

### Goal
Enable users to upload CVs and automatically extract/organize professional information.

### Independent Test Criteria
- User can upload PDF/DOCX CV files
- System extracts data into 6 main sections accurately
- Tabbed interface displays extracted data correctly
- Users can edit extracted data and add context
- Profile persists to database successfully

### Implementation Tasks

- [X] T034 [P] Create CV parsing service in frontend/src/lib/parsing/cv-parser.ts
- [X] T035 [P] Implement PDF extraction using pdf-parse library
- [X] T036 [P] Implement DOCX extraction using mammoth.js
- [X] T037 [P] Create User model and authentication API in frontend/src/app/api/auth/
- [X] T038 [P] Create UserProfile API routes in frontend/src/app/api/profile/
- [X] T039 [US1] Implement CV upload endpoint in frontend/src/app/api/profile/upload-cv/route.ts
- [X] T040 [P] Create Ollama integration for structured data extraction in frontend/src/lib/ai/ollama.ts
  - *Note: Depends on T035 or T036 (requires extracted text to test the extraction pipeline)*
- [X] T041 [US1] Implement AI-powered CV parsing pipeline
- [X] T042 [P] Create profile data validation schemas in frontend/src/lib/validation/
- [X] T043 [US1] Build profile management UI components in frontend/src/components/profile/
- [X] T044 [US1] Create tabbed interface for profile sections in frontend/src/components/profile/ProfileTabs.tsx
- [X] T045 [US1] Implement editable forms for each profile section
- [X] T046 [US1] Create profile page in frontend/src/app/profile/page.tsx
- [X] T047 [US1] Add profile navigation to main layout
- [X] T048 [US1] Implement profile data persistence to database
- [X] T049 [US1] Add profile editing and update functionality
- [X] T049a [US1] Build CV Upload component (Ant Design Dragger) and integrate with /api/profile/upload-cv and extraction hook
- [X] T049b [US1] Update MainLayout Header with User Avatar, session state, and Logout dropdown

## Phase 4: User Story 2 - Job Discovery and Smart Filtering

### Goal
Enable users to search remote jobs across portals with AI-powered filtering.

### Independent Test Criteria
- Users can configure job search portals
- System scrapes jobs from selected portals
- AI pipeline processes and filters jobs effectively
- Results show compatibility scores and key information
- Users can favorite and filter job listings

### Implementation Tasks

- [X] T050 [P] Create job portal configuration models and API in frontend/src/app/api/portals/
- [X] T051 [P] Implement web scraping service with Playwright in frontend/src/lib/scraping/
- [X] T051b [P] Implement Global Worker (24/7) - Stage A: Continuous List Ingestion (Level 0)
- [ ] T051c [P] Implement Enrichment Worker - **Stage B**: Asynchronous Background Fetch for full descriptions and search vectors
- [X] T052 [P] Create generic job scraper in frontend/src/lib/scraping/generic-scraper.ts
- [X] T052a [P] Implement AI Selector Auto-Discovery service (Ollama DOM Analysis) in frontend/src/lib/scraping/discovery.ts
- [X] T053 [P] Implement provider-specific scrapers (WeWorkRemotely, LinkedIn) in frontend/src/lib/scraping/providers/
- [X] T054 [US2] Create job search API endpoints in frontend/src/app/api/search/
- [X] T054b [P] Update Prisma schema and models to support weighted search profiles (Titles, Hard/Soft Skills weights)
- [X] T054c [US2] Restructure `MainLayout` to include Job Search submenus: Discovery, Config, Admin
- [X] T054d [US2] Implement Admin Panel restricted to `USER_ADMIN_EMAIL` for global portal management
- [X] T055 [P] Implement Level 1 TensorFlow.js scoring (Fast Cosine Similarity) for real-time ranking in the UI
- [ ] T055a [P] Implement Level 2 Deep Scraper for full-text extraction (Manual/On-Demand trigger)
- [ ] T056 [P] Create AI Analysis pipeline (Level 4) for match reasoning and insights (Manual/On-Demand trigger)
- [X] T057 [P] Set up job data storage and caching with Redis
- [X] T058 [US2] Build Job Discovery List view with "Suggested" toggle and fast score display
- [X] T059 [US2] Create job listing cards with match status and "Analyze Deeper" action button
- [X] T060 [US2] Implement Job Search Config UI with weighted tabs in frontend/src/components/jobs/JobSearch.tsx
- [ ] T061 [US2] Create job results page with filtered views (Location, Role, Type)
- [ ] T062 [US2] Add job favoriting and manual score override functionality
- [ ] T063 [US2] Implement real-time search progress tracking (Funnel status)
- [ ] T064 [US2] Add job detail view and external link handling

## Phase 5: User Story 3 - Application Personalization

### Goal
Generate AI-powered CV suggestions and personalized cover letters for specific jobs.

### Independent Test Criteria
- Users can request CV improvement suggestions for specific jobs
- System provides actionable, job-specific recommendations
- Cover letters are personalized and high-quality
- Generated content integrates user profile and job requirements
- Users can edit and customize generated materials

### Implementation Tasks

- [ ] T065 [P] Create premium AI API client for high-complexity AI services in frontend/src/lib/ai/premium-ai.ts
  - *Justification: Cover letter generation and CV suggestions are high-complexity tasks that justify premium AI tier per Constitution V*
- [ ] T066 [P] Implement CV suggestion generation service in frontend/src/lib/ai/cv-suggestions.ts
  - *Justification: Advanced CV improvement suggestions require premium AI per Constitution V*
- [ ] T067 [P] Create cover letter generation service in frontend/src/lib/ai/cover-letter.ts
  - *Justification: Personalized cover letter generation is high-value content creation justifying premium AI tier per Constitution V*
- [ ] T068 [US3] Create application management API in frontend/src/app/api/applications/
- [ ] T069 [P] Implement AI service cost optimization and caching
- [ ] T070 [US3] Build application personalization UI in frontend/src/components/applications/
- [ ] T071 [US3] Create CV suggestions component in frontend/src/components/applications/CVSuggestions.tsx
- [ ] T072 [US3] Implement cover letter generator in frontend/src/components/applications/CoverLetterGenerator.tsx
- [ ] T073 [US3] Add application materials preview and editing
- [ ] T074 [US3] Create application submission workflow
- [ ] T075 [US3] Implement AI content quality validation and user feedback system
  - Create automated quality checks (coherence, grammar, relevance)
  - Implement user feedback capture (thumbs up/down, rating, comments)
  - Use feedback to improve future AI prompts and content generation

## Phase 6: User Story 4 - Application Tracking Dashboard

### Goal
Provide comprehensive dashboard for tracking job application status and progress.

### Independent Test Criteria
- Dashboard displays all applications with current status
- Users can update application statuses easily
- Timeline shows application history and changes
- Statistics and insights are accurate and helpful
- Follow-up reminders and notifications work

### Implementation Tasks

- [ ] T076 [P] Create application status management API in frontend/src/app/api/dashboard/
- [ ] T077 [P] Implement dashboard statistics calculation service
- [ ] T078 [US4] Build dashboard UI components in frontend/src/components/dashboard/
- [ ] T079 [US4] Create application status tracking interface in frontend/src/components/dashboard/ApplicationTracker.tsx
- [ ] T080 [US4] Implement dashboard statistics widgets in frontend/src/components/dashboard/StatsWidgets.tsx
- [ ] T081 [US4] Create application timeline view in frontend/src/components/dashboard/ApplicationTimeline.tsx
- [ ] T082 [US4] Build main dashboard page in frontend/src/app/dashboard/page.tsx
- [ ] T083 [US4] Add status update workflows and notifications
- [ ] T084 [US4] Implement follow-up reminder system
- [ ] T085 [US4] Create dashboard filtering and search
- [ ] T086 [US4] Add export functionality for application data

## Phase 7: Polish & Cross-Cutting Concerns

### Goal
Implement final polish, performance optimization, and production readiness.

### Independent Test Criteria
- All features work seamlessly together
- Performance meets specified goals (<2s job processing, <5s CV parsing)
- Security and privacy requirements satisfied
- Application is production-ready and scalable

### Implementation Tasks

- [ ] T087 [P] Implement comprehensive error handling and user feedback
- [ ] T088 [P] Add loading states and progress indicators throughout UI
- [ ] T089 [P] Refine dark mode theme and add light mode toggle
  - **Note**: Base dark mode theme already implemented in T033a with centralized theme.ts
  - Add light mode theme configuration to `frontend/src/lib/theme.ts`
  - Implement theme switching mechanism (dark/light/auto)
  - Add theme toggle component to UI
  - Ensure all components work correctly in both modes
  - Test color contrast and accessibility in both themes
- [ ] T090 [P] Add responsive design for mobile and tablet
- [ ] T091 [P] Implement accessibility features (ARIA labels, keyboard navigation)
- [ ] T092 [P] Add comprehensive input validation and sanitization
- [ ] T093 [P] Implement security headers and CSRF protection
- [ ] T094 [P] Optimize database queries and add proper indexing
- [ ] T095 [P] Implement AI service fallback and retry mechanisms
- [ ] T096 [P] Add comprehensive logging and error tracking
- [ ] T097 [P] Create user onboarding flow and help documentation
- [ ] T098 [P] Implement data export and privacy controls
- [ ] T099 [P] Create production deployment configuration

## Phase 8: Testing & Quality Assurance

### Goal
Implement comprehensive test coverage to meet Constitution-mandated 80% minimum coverage requirement before production release.

### Independent Test Criteria
- Unit tests cover all business logic and utilities (80%+ coverage)
- Integration tests validate all third-party boundaries (AI, Email, Database, Auth)
- E2E tests verify critical user flows end-to-end
- All tests pass in CI/CD pipeline

### Implementation Tasks

- [ ] T100 [P] Write unit tests for authentication and user management services
- [ ] T101 [P] Write unit tests for CV parsing and profile services
- [ ] T102 [P] Write unit tests for job scraping and AI matching services
- [ ] T103 [P] Write unit tests for application personalization services
- [ ] T104 [P] Write integration tests for API endpoints (auth, profile, jobs, applications)
- [ ] T105 [P] Write integration tests for AI services (Ollama, premium AI, TensorFlow.js)
- [ ] T106 [P] Write integration tests for database operations (Prisma, MongoDB)
- [ ] T107 [P] Write integration tests for email and notification services (Resend, Twilio)
- [ ] T108 [P] Write E2E tests for critical user flows (signup → profile → job search → application)
- [ ] T109 [P] Add automated testing pipeline (CI/CD for unit, integration, E2E tests)
- [ ] T109a [P] Build comprehensive Settings page layout for user preferences and account management
- [ ] T110 [P] Review and refine notification preferences UI when implementing Settings page
  - *Note: T033 was implemented in Phase 2 but needs UI/UX review during Settings page development*

## Phase 9: Metrics & Monitoring (Post-MVP)

### Goal
Implement comprehensive metrics collection and monitoring infrastructure for measuring Success Criteria and production observability. These tasks are post-MVP and do not block core functionality delivery.

### Independent Test Criteria
- System can track and report performance metrics (SC-005: 99% uptime monitoring)
- Email delivery metrics are collected (SC-006 to SC-012)
- Dashboard provides visibility into system health and user engagement
- Alerts trigger appropriately for production issues

### Implementation Tasks

- [ ] T111 [P] Add performance monitoring and metrics collection instrumentation
  - Track API response times, database query performance, AI service latency
  - Implement uptime monitoring and availability dashboards
  - Success Criteria: SC-005 (99% uptime for core features)
- [ ] T112 [P] Add monitoring and alerting for production issues
  - Set up alerting channels (email/Slack) for critical errors
  - Configure thresholds for error rates, response times, service availability
  - Implement on-call rotation and incident response procedures
- [ ] T113 [P] Implement Success Criteria metrics tracking system
  - Instrument email delivery tracking (SC-006, SC-007, SC-010, SC-011)
  - Track notification effectiveness metrics (SC-008, SC-009, SC-012)
  - Create reporting dashboard for business KPIs

## Dependencies

### User Story Completion Order
1. **Phase 1 & 2**: Setup and Infrastructure (prerequisites for all stories)
2. **User Story 1** (T034-T049): Profile Setup - Foundation for all other features
3. **User Story 2** (T050-T064): Job Discovery - Core value proposition
4. **User Story 3** (T065-T075): Application Personalization - Advanced AI features
5. **User Story 4** (T076-T086): Application Tracking - Supporting functionality
6. **Phase 7** (T087-T099): Polish & Production Readiness
7. **Phase 8** (T100-T110): Testing & Quality Assurance
8. **Phase 9** (T111-T113): Metrics & Monitoring (Post-MVP)

### Critical Dependencies
- User Story 1 → User Story 2 (profile data needed for job matching)
- User Story 2 → User Story 3 (job data needed for personalization)
- User Story 3 → User Story 4 (applications needed for tracking)
- Phase 9 depends on all previous phases (requires system to be running for meaningful metrics)

## Parallel Execution Opportunities

### Within User Stories
- **Profile Setup**: CV parsing (T034-T036) can run parallel with UI components (T043-T047)
- **Job Discovery**: Scraping (T050-T053) can run parallel with AI pipeline (T055-T056)
- **Application Personalization**: AI services (T065-T067) can run parallel with UI components (T070-T072)
- **Application Tracking**: API development (T076-T077) can run parallel with UI components (T078-T081)

### Cross-Story Parallelization
- Infrastructure tasks (T013-T024) can run parallel with early story tasks
- UI components can be developed in parallel with backend APIs
- Testing and polish tasks (T087-T110) can start as soon as respective features are complete

## Implementation Strategy

### MVP Scope (First Release)
**Focus**: User Story 1 + User Story 2 (Core functionality)
- Complete profile setup and CV processing
- Enable job discovery and basic filtering
- Implement essential authentication and data persistence
- Add basic UI with dark mode support
- **Excluded from MVP**: Phase 9 (Metrics & Monitoring) - see Post-MVP Scope

### Incremental Delivery
1. **Release 1**: Profile management + Job search (T001-T064)
2. **Release 2**: Application personalization (T065-T075)
3. **Release 3**: Application tracking dashboard (T076-T086)
4. **Release 4**: Polish and production readiness (T087-T099)
5. **Release 5**: Testing & Quality Assurance (T100-T110)
6. **Release 6** (Post-MVP): Metrics & Monitoring (T111-T113)

### Risk Mitigation
- **AI Service Dependencies**: Implement fallbacks and caching early (T021, T069)
- **Performance**: Monitor and optimize database queries from start (T094)
- **Security**: Implement validation and sanitization from beginning (T092)
- **Scalability**: Design for horizontal scaling with proper indexing (T094)

## Task Summary

- **Total Tasks**: 124 (113 + T033a + T003a, T031a, T032a, T033b, T109a, T033c, T033d, T033e, T049a, T049b added)
- **Completed Tasks**: 33
- **Pending Tasks**: 91
- **Setup Tasks**: 13 (Phase 1, T001-T012, T003a)
- **Infrastructure Tasks**: 28 (Phase 2, T013-T033, T033a, T031a, T032a, T033b, T033c, T033d, T033e)
  - Includes T033a: Ant Design theme configuration per UI Theming Strategy
- **User Story 1 Tasks**: 18 (Phase 3, T034-T049, T049a, T049b)
- **User Story 2 Tasks**: 15 (Phase 4, T050-T064)
- **User Story 3 Tasks**: 11 (Phase 5, T065-T075)
- **User Story 4 Tasks**: 11 (Phase 6, T076-T086)
- **Polish Tasks**: 13 (Phase 7, T087-T099)
  - T089 updated: Refine dark mode and add light mode toggle (base theme done in T033a)
- **Testing Tasks**: 12 (Phase 8, T100-T110, T109a)
- **Metrics & Monitoring Tasks**: 3 (Phase 9, T111-T113) - Post-MVP

### MVP vs Post-MVP Breakdown
- **MVP Tasks**: T034-T110 (77 tasks) - Core functionality, polish, and testing
- **Post-MVP Tasks**: T111-T113 (3 tasks) - Metrics instrumentation and monitoring

### Parallel Opportunities Identified
- **High Parallelization**: 35+ tasks can be executed in parallel
- **Critical Path**: ~30 tasks that must be sequential
- **Estimated Timeline**: 8-12 weeks for full implementation (2-3 weeks per user story)

This task breakdown provides a clear, executable roadmap for implementing the ApplyCopilot system with proper dependencies, parallelization opportunities, and incremental delivery strategy.
