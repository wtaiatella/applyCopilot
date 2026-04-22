# Feature Specification: ApplyCopilot Job Search Automation System

**Feature Branch**: `001-apply-copilot-system`  
**Created**: 2025-06-17  
**Status**: Draft  
**Input**: User description: "ApplyCopilot - intelligent job search automation system with AI-powered filtering and application personalization"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Profile Setup and CV Processing (Priority: P1)

As a job seeker, I want to upload my CV and have the system automatically extract and organize my professional information so that I can easily manage my profile data without manual data entry.

**Why this priority**: This is the foundation for all other features - without a complete user profile, the AI cannot provide personalized recommendations or generate tailored application materials.

**Independent Test**: Can be fully tested by uploading a sample CV and verifying that all sections (basic data, experiences, education, projects, skills, references) are correctly parsed and displayed in the tabbed interface.

**Acceptance Scenarios**:

1. **Given** I am a new user with a PDF CV, **When** I upload my CV file, **Then** the system extracts and organizes my data into six main sections with editable fields
2. **Given** my CV has been processed, **When** I review any section (experiences, education, etc.), **Then** I see tabbed interface with individual items and can edit bullet points or add free-form context

---

### User Story 2 - Job Discovery and Smart Filtering (Priority: P1)

As a job seeker, I want to search for remote jobs across multiple portals and see only the most relevant matches so that I can focus my time on opportunities that align with my skills and preferences.

**Why this priority**: This is the core value proposition - automated job discovery with intelligent filtering saves users significant time and increases application quality.

**Independent Test**: Can be fully tested by configuring job portals, running a search, and verifying that the system returns relevant job listings with compatibility scores and filters out irrelevant matches.

**Acceptance Scenarios**:

1. **Given** I have configured job search portals, **When** I initiate a job search, **Then** the system scrapes jobs from selected portals and processes them through the AI filtering pipeline
2. **Given** jobs have been processed, **When** I view results, **Then** I see job cards with compatibility scores, key requirements, and can favorite or filter positions

---

### User Story 3 - Application Personalization (Priority: P2)

As a job seeker, I want to receive AI-generated suggestions for improving my CV and create tailored cover letters for specific jobs so that my applications stand out and better match each position's requirements.

**Why this priority**: This feature delivers the "copilot" value by actively helping users improve their application materials and increase their chances of success.

**Independent Test**: Can be fully tested by selecting a favorited job and requesting CV suggestions and cover letter generation, then reviewing the quality and relevance of the generated content.

**Acceptance Scenarios**:

1. **Given** I have favorited a job, **When** I request CV improvement suggestions, **Then** the system provides specific, actionable recommendations based on job requirements
2. **Given** I have favorited a job, **When** I request a cover letter, **Then** the system generates a personalized cover letter incorporating my profile and job details

---

### User Story 4 - Application Tracking Dashboard (Priority: P3)

As a job seeker, I want to track the status of all my job applications in one place so that I can monitor my job search progress and follow up appropriately.

**Why this priority**: While useful for organization, this is a supporting feature that enhances the core value but is not essential for the MVP.

**Independent Test**: Can be fully tested by updating application statuses and verifying that the dashboard correctly displays the current state and history of each application.

**Acceptance Scenarios**:

1. **Given** I have applied to jobs, **When** I view my dashboard, **Then** I see all applications with their current status (Applied, Interview, Technical Test, Offer, Rejected)
2. **Given** I receive an interview invitation, **When** I update the application status, **Then** the dashboard reflects the new state and timeline

---

### User Story 5 - Communication & Notifications (Priority: P2)

As a registered user, I want to receive timely notifications about important events (password recovery, job matches, application updates) via email and WhatsApp so that I never miss critical opportunities or security alerts.

**Why this priority**: Communication is essential for user engagement and security. Password recovery enables account access restoration, job match notifications drive core platform value, and status updates keep users informed without requiring constant manual checking.

**Independent Test**: Can be fully tested by triggering each notification type (welcome email, password reset, job matches, application status change) and verifying delivery via both email and WhatsApp channels.

**Acceptance Scenarios**:

1. **Given** I am a new user who just registered, **When** my account is created, **Then** I receive a welcome email within 30 seconds with platform introduction and quick start guide
2. **Given** I forgot my password, **When** I request password reset via email, **Then** I receive a secure reset link within 60 seconds that expires after 24 hours
3. **Given** AI finds job matches for my profile, **When** 3+ compatible jobs are identified, **Then** I receive a batched email digest within 5 minutes with job summaries and compatibility scores
4. **Given** I have verified my phone number, **When** a critical event occurs (interview scheduled), **Then** I receive WhatsApp notification within 1 minute with details and preparation tips
5. **Given** I want to control notifications, **When** I update my preferences, **Then** system respects my choices and only sends opted-in notification types

---

### Edge Cases

- What happens when CV upload fails due to corrupted file or unsupported format?
- How does system handle job portals that change their HTML structure or require authentication?
- What happens when AI services (Ollama, premium APIs) are unavailable or rate-limited?
- How does system handle users with minimal work experience or non-standard CV formats?
- What happens when user requests multiple password resets in short time? (Rate limiting: max 3 requests per hour)
- How does system handle email bounces or undeliverable addresses? (Mark as invalid after 3 soft bounces, 1 hard bounce)
- What if WhatsApp API is temporarily unavailable? (Queue messages, retry with exponential backoff, fallback to email)
- How does system prevent notification fatigue from too many job matches? (Batch multiple matches, respect user frequency preferences)
- What happens when email template rendering fails? (Use plain text fallback, log error, alert developers)
- How does system handle users who mark emails as spam? (Honor unsubscribe, investigate content, update reputation)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to upload CV files in PDF or DOCX format
- **FR-002**: System MUST automatically extract and categorize CV data into six main sections (basic data, experiences, education, projects, skills, references)
- **FR-003**: System MUST provide tabbed interface for managing multiple items within each profile section
- **FR-004**: System MUST allow users to edit extracted data and add free-form context descriptions
- **FR-005**: System MUST support job portal configuration including pre-configured options (WeWorkRemotely, LinkedIn) and custom URLs
- **FR-006**: System MUST implement dual-layer scraping with generic and provider-specific extractors
- **FR-007**: System MUST process scraped jobs through AI pipeline (local parsing, pre-filtering, premium analysis)
- **FR-008**: System MUST display job results with compatibility scores and key information
- **FR-009**: System MUST allow users to favorite jobs and request personalized suggestions
- **FR-010**: System MUST generate CV improvement suggestions based on job requirements
- **FR-011**: System MUST generate personalized cover letters using premium AI
- **FR-012**: System MUST provide application status tracking with predefined stages
- **FR-013**: System MUST maintain user data privacy by processing sensitive information locally when possible
- **FR-014**: System MUST send welcome email to new users within 30 seconds of registration
- **FR-015**: System MUST allow users to request password reset via email with secure time-limited tokens (24 hours)
- **FR-016**: System MUST send job match notification emails when AI identifies compatible positions, batching multiple matches
- **FR-017**: System MUST support WhatsApp Business API integration for critical notifications (interviews, deadlines)
- **FR-018**: System MUST implement fallback to email when WhatsApp delivery fails
- **FR-019**: System MUST provide notification preference settings allowing users to control email/WhatsApp frequency and types
- **FR-020**: System MUST track email delivery status (sent, delivered, opened, bounced) for analytics
- **FR-021**: System MUST implement rate limiting on notification endpoints (max 3 password resets/hour, max 5 emails/minute per user)
- **FR-022**: System MUST render HTML email templates with ApplyCopilot branding and responsive design
- **FR-023**: System MUST provide unsubscribe links in all non-transactional emails with 24-hour processing guarantee

### Key Entities *(include if feature involves data)*

- **User Profile**: Central entity containing all professional information extracted from CV, including basic data, experiences, education, projects, skills, and references
- **Job Listing**: External job opportunity data scraped from portals, including title, company, requirements, location, and application details
- **Job Match**: Relationship entity storing compatibility scores, analysis results, and AI-generated insights between user profile and job listings
- **Application**: Tracking entity representing user's job application status and history for specific positions
- **Portal Configuration**: User preferences for job sources, scraping settings, and search criteria
- **EmailTemplate**: Stores HTML/text templates for different notification types (welcome, password reset, job matches) with variables and branding
- **NotificationLog**: Audit trail of all sent notifications with delivery status, timestamps, retry attempts, and error tracking
- **UserNotificationPreferences**: User settings for notification channels (email, WhatsApp), frequency (immediate, digest), and types (matches, status updates)
- **PasswordResetToken**: Secure token entity for password recovery with expiration timestamp and user reference

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete CV upload and profile setup in under 5 minutes with 95% accuracy in data extraction
- **SC-002**: System processes and filters 100 job listings in under 2 minutes with 90% reduction in irrelevant matches compared to manual search
- **SC-003**: Users report 80% satisfaction with AI-generated application materials (CV suggestions and cover letters)
- **SC-004**: System reduces job search time by 70% compared to manual methods through automated discovery and filtering
- **SC-005**: System maintains 99% uptime for core features (profile management, job search, application tracking)
- **SC-006**: Password reset emails delivered within 60 seconds with 99.5% delivery rate
- **SC-007**: Welcome emails sent to 100% of new registrations within 30 seconds
- **SC-008**: Job match notification emails achieve minimum 25% open rate and 5% click-through rate
- **SC-009**: WhatsApp notifications delivered within 1 minute with 95% delivery rate for critical events
- **SC-010**: Email bounce rate stays below 2% indicating good list hygiene
- **SC-011**: Password reset success rate (completed resets / requested) exceeds 85%
- **SC-012**: Support tickets related to "not receiving notifications" reduced by 90%

## Clarifications

### AI Processing Strategy
**Decision**: Hybrid approach with local processing for basic tasks and premium APIs for high-value content generation
- Local AI (Ollama) handles: CV parsing, job data extraction, basic compatibility scoring
- Premium APIs handle: Cover letter generation, advanced CV improvement suggestions, nuanced job matching
- Fallback: Local processing when premium APIs are unavailable
- Use Case: Convert scraped markdown files to structured JSON for consistent job listings

### User Authentication & Data Persistence
**Decision**: Email/password authentication with MongoDB database persistence
- MongoDB with Prisma ORM for all user data storage (CV profiles, applications, preferences)
- No export functionality needed since data persists in database
- Authentication system for user account management and data security

### Job Portal Scraping Frequency
**Decision**: On-demand scraping with user-initiated searches
- Scraping triggered only when user explicitly initiates job search
- No background or scheduled scraping to avoid unnecessary API calls
- Users control when and which portals to search

### Compatibility Scoring Algorithm
**Decision**: TensorFlow.js cosine similarity with TF-IDF vectorization
- Initial scoring using cosine similarity between CV and job description vectors
- Vector structure: skills matrix with hard/soft skills and preference weightings
- Different scoring ranges for preferred vs complementary skills
- Lightweight mathematical approach suitable for pre-filtering

### Error Handling for AI Service Failures
**Decision**: Graceful degradation with queue and retry mechanism
- Queue failed AI requests and automatically retry when services return
- Provide basic functionality using local processing during outages
- User notifications for service status and queued operations
- Fallback to local Ollama processing when premium APIs are unavailable

### Communication & Notification Strategy
**Decision**: Resend for transactional emails, Twilio WhatsApp Business API for mobile notifications
- Resend API handles: Welcome emails, password reset, job match digests, application status updates
- WhatsApp Business API handles: Critical notifications only (interview scheduling, deadline reminders)
- Email templates: Server-side rendered React components with ApplyCopilot branding
- Rate limiting: Prevents abuse and maintains sender reputation
- Fallback: Email delivery when WhatsApp fails or user prefers email only

### Notification Frequency & User Control
**Decision**: Smart batching with user-configurable preferences
- Job matches: Batched into single email when 3+ matches found within 5-minute window
- Critical events: Immediate delivery via both email and WhatsApp (if enabled)
- Digest mode: Daily summary option for users who prefer less frequent updates
- Unsubscribe: Always honored for non-transactional emails (marketing, digests)
- Transactional emails (password reset, security alerts): Cannot be disabled

## Assumptions

- Users have existing CVs in digital format (PDF or DOCX)
- Users are primarily seeking remote job opportunities
- Users have basic computer literacy and can navigate web interfaces
- Local AI processing (Ollama) has sufficient hardware resources for target user base
- Premium AI APIs remain available and cost-effective for the target usage volume
- Job portals do not implement aggressive anti-scraping measures that would prevent data extraction
- Users understand that AI-generated content should be reviewed and personalized before submission
- Users have valid email addresses and will verify them during registration
- Resend API maintains deliverability rates of 95%+ for transactional emails
- WhatsApp Business API pricing is acceptable for notification volume (critical events only)
- Users consent to receiving transactional emails as part of Terms of Service
- Third-party communication APIs (Resend, Twilio) maintain 99%+ uptime SLA
- Email templates render correctly across major email clients (Gmail, Outlook, Apple Mail)
- SMS fallback is not required for MVP; email is sufficient fallback for WhatsApp failures
