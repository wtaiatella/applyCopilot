# Data Model: ApplyCopilot Job Search Automation System

**Date**: 2025-06-17  
**Purpose**: Define entities, relationships, and validation rules based on feature specification

## Core Entities

### User
**Purpose**: Central user account and authentication data

```typescript
interface User {
  id: string                    // UUID v4
  email: string                 // Unique, verified email
  name: string                  // Full name
  avatar?: string              // Profile picture URL
  createdAt: Date              // Account creation timestamp
  updatedAt: Date              // Last update timestamp
  emailVerified: Date | null   // Email verification timestamp
}
```

### UserProfile
**Purpose**: Complete professional profile extracted from CV

```typescript
interface UserProfile {
  id: string                    // UUID v4, relates to User.id
  userId: string               // Foreign key to User
  
  // Basic Data (editable except email)
  firstName: string
  lastName: string
  phone?: string
  location?: string
  portfolioLinks: string[]
  
  // Dynamic Summary Management
  summaries: ProfileSummary[]    // Multiple summary versions
  
  // Tab-based Content Sections
  experiences: Experience[]
  education: Education[]
  projects: Project[]
  skills: Skill[]
  references: Reference[]
  
  createdAt: Date
  updatedAt: Date
}

interface ProfileSummary {
  id: string
  title: string                // Summary title/version
  content: string              // Summary text
  isAIGenerated: boolean       // AI generation flag
  isActive: boolean            // Currently selected summary
  createdAt: Date
}

interface Experience {
  id: string
  company: string
  position: string
  startDate: Date
  endDate?: Date              // null for current position
  bulletPoints: string[]       // Editable bullet points
  freeFormContext: string      // User's own description
  aiSuggestions: string[]      // AI-generated bullets
  createdAt: Date
}

interface Education {
  id: string
  institution: string
  degree: string
  field: string
  startDate: Date
  endDate?: Date
  bulletPoints: string[]
  freeFormContext: string
  aiSuggestions: string[]
  createdAt: Date
}

interface Project {
  id: string
  name: string
  description: string
  technologies: string[]
  startDate: Date
  endDate?: Date
  bulletPoints: string[]
  freeFormContext: string
  aiSuggestions: string[]
  createdAt: Date
}

interface Skill {
  id: string
  name: string
  category: 'technical' | 'soft' | 'language'
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  yearsExperience?: number
}

interface Reference {
  id: string
  name: string
  position: string
  company: string
  email?: string
  phone?: string
  relationship: string        // e.g., "Former Manager"
}
```

### JobPortal
**Purpose**: Configuration for job search sources

```typescript
interface JobPortal {
  id: string
  name: string                 // e.g., "WeWorkRemotely", "LinkedIn"
  baseUrl: string             // Portal base URL
  isActive: boolean           // User can enable/disable
  scraperConfig: ScraperConfig
  userId: string              // Foreign key to User
  
  createdAt: Date
  updatedAt: Date
}

interface ScraperConfig {
  type: 'generic' | 'provider-specific'
  selectors?: Record<string, string>  // CSS selectors for provider-specific
  authRequired: boolean
  rateLimit: number          // Requests per minute
}
```

### JobListing
**Purpose**: Scraped job opportunity data

```typescript
interface JobListing {
  id: string
  portalId: string           // Foreign key to JobPortal
  externalId: string         // Portal-specific job ID
  
  // Basic Job Information
  title: string
  company: string
  location: string
  remoteType: 'remote' | 'hybrid' | 'onsite'
  
  // Job Details
  description: string         // Full job description
  requirements: string[]      // Key requirements
  responsibilities: string[] // Key responsibilities
  salary?: {
    min?: number
    max?: number
    currency: string
  }
  
  // Metadata
  postedAt: Date
  expiresAt?: Date
  applicationUrl: string
  sourceUrl: string          // Original job posting URL
  
  // Processing Status
  status: 'scraped' | 'processed' | 'filtered' | 'analyzed'
  processedAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

### JobMatch
**Purpose**: Compatibility analysis between user profile and job listings

```typescript
interface JobMatch {
  id: string
  userId: string              // Foreign key to User
  jobId: string              // Foreign key to JobListing
  
  // Compatibility Scoring
  overallScore: number        // 0-100 overall compatibility
  skillMatchScore: number     // Skill-based compatibility
  experienceMatchScore: number // Experience-based compatibility
  locationMatchScore: number  // Location preference match
  
  // Analysis Results
  matchedSkills: string[]
  missingSkills: string[]
  skillGaps: string[]        // AI-identified skill gaps
  
  // AI Insights
  analysis: {
    strengths: string[]       // User's strengths for this role
    improvementAreas: string[] // Areas to highlight
    recommendations: string[] // Application strategy suggestions
  }
  
  // Processing Pipeline
  prefilteredAt: Date        // TensorFlow.js pre-filtering
  parsedAt: Date             // Ollama structured parsing
  analyzedAt: Date          // Premium AI analysis
  
  createdAt: Date
  updatedAt: Date
}
```

### Application
**Purpose**: User's job application tracking

```typescript
interface Application {
  id: string
  userId: string              // Foreign key to User
  jobId: string              // Foreign key to JobListing
  matchId: string            // Foreign key to JobMatch
  
  // Application Details
  status: 'saved' | 'applied' | 'interview' | 'technical_test' | 'offer' | 'rejected' | 'withdrawn'
  appliedAt?: Date           // When user applied
  statusHistory: StatusChange[]
  
  // Generated Materials
  cvSuggestions: string[]      // AI-generated CV improvements
  coverLetter?: string       // Generated cover letter
  customResume?: string      // Tailored resume content
  
  // Notes and Tracking
  notes: string              // User's personal notes
  nextSteps?: string         // Planned next actions
  followUpDate?: Date        // When to follow up
  
  createdAt: Date
  updatedAt: Date
}

interface StatusChange {
  status: Application['status']
  changedAt: Date
  notes?: string
}
```

### SearchQuery
**Purpose**: User's job search configurations

```typescript
interface SearchQuery {
  id: string
  userId: string              // Foreign key to User
  
  // Search Criteria
  title: string              // Search query title/name
  keywords: string[]         // Job title keywords
  technologies: string[]     // Required technologies
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead'
  
  // Filters
  remoteOnly: boolean
  salaryMin?: number
  salaryMax?: number
  locations: string[]        // Preferred locations
  
  // Portal Selection
  portalIds: string[]        // Selected JobPortal IDs
  
  // Search Settings
  isActive: boolean
  lastRun?: Date
  frequency: 'daily' | 'weekly' | 'manual'
  
  createdAt: Date
  updatedAt: Date
}
```

## Relationships and Constraints

### Primary Relationships
- User (1) → UserProfile (1)
- User (1) → JobPortal (N)
- User (1) → SearchQuery (N)
- User (1) → Application (N)
- JobPortal (1) → JobListing (N)
- JobListing (1) → JobMatch (N)
- User (1) → JobMatch (N)
- JobListing (1) → Application (N)
- JobMatch (1) → Application (1)

### Validation Rules

#### User Validation
```typescript
const UserValidation = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  avatar: z.string().url().optional()
})
```

#### UserProfile Validation
```typescript
const UserProfileValidation = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/).optional(),
  portfolioLinks: z.array(z.string().url()).max(5),
  summaries: z.array(z.any()).min(1) // At least one summary
})
```

#### JobListing Validation
```typescript
const JobListingValidation = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(100),
  description: z.string().min(50),
  requirements: z.array(z.string()).min(1),
  applicationUrl: z.string().url(),
  sourceUrl: z.string().url()
})
```

### Indexes for Performance

#### MongoDB Indexes
```javascript
// User and Profile
db.users.createIndex({ email: 1 }, { unique: true })
db.userprofiles.createIndex({ userId: 1 }, { unique: true })

// Job Listings
db.joblistings.createIndex({ portalId: 1, externalId: 1 }, { unique: true })
db.joblistings.createIndex({ status: 1, createdAt: -1 })
db.joblistings.createIndex({ title: "text", company: "text" })

// Job Matches
db.jobmatches.createIndex({ userId: 1, overallScore: -1 })
db.jobmatches.createIndex({ jobId: 1, userId: 1 }, { unique: true })

// Applications
db.applications.createIndex({ userId: 1, status: 1 })
db.applications.createIndex({ jobId: 1, userId: 1 }, { unique: true })
```

## Data Lifecycle

### Data Retention
- **Job Listings**: Retain for 90 days after expiry
- **Job Matches**: Retain for 30 days (cache analysis results)
- **Search Queries**: Retain indefinitely (user preferences)
- **Applications**: Retain indefinitely (user data)

### Data Privacy
- **CV Files**: Temporary storage, deleted after processing
- **AI Prompts**: Not stored with user data
- **External API Calls**: Minimal data sent, logged for cost tracking

## State Transitions

### Application Status Flow
```
saved → applied → interview → technical_test → offer
   ↓        ↓         ↓              ↓         ↓
rejected ← rejected ← rejected ← rejected ← rejected
```

### Job Processing Pipeline
```
scraped → processed → filtered → analyzed
   ↓         ↓          ↓         ↓
  (raw)   (parsed)  (scored)  (insights)
```

This data model provides comprehensive coverage of all entities identified in the feature specification, with proper relationships, validation rules, and performance optimizations.
