# API Contracts: ApplyCopilot Job Search Automation System

**Date**: 2025-06-17  
**Purpose**: Define external API interfaces and data contracts

## Authentication API

### POST /api/auth/signin
**Purpose**: User authentication with email/password

**Request**:
```typescript
interface SignInRequest {
  email: string
  password: string
}
```

**Response**:
```typescript
interface SignInResponse {
  success: boolean
  user?: {
    id: string
    email: string
    name: string
  }
  error?: string
}
```

### GET /api/auth/session
**Purpose**: Get current user session

**Response**:
```typescript
interface SessionResponse {
  user?: {
    id: string
    email: string
    name: string
  }
  expires: string
}
```

## Profile Management API

### POST /api/profile/upload-cv
**Purpose**: Upload and process CV file

**Request**: `multipart/form-data`
- `file`: CV file (PDF or DOCX, max 10MB)

**Response**:
```typescript
interface CVUploadResponse {
  success: boolean
  profileId?: string
  extractedData?: {
    basicData: UserProfile['firstName' | 'lastName' | 'phone' | 'location' | 'portfolioLinks']
    experiences: Omit<Experience, 'id' | 'createdAt'>[]
    education: Omit<Education, 'id' | 'createdAt'>[]
    projects: Omit<Project, 'id' | 'createdAt'>[]
    skills: Omit<Skill, 'id'>[]
    references: Omit<Reference, 'id'>[]
  }
  error?: string
}
```

### PUT /api/profile/basic-data
**Purpose**: Update user's basic profile information

**Request**:
```typescript
interface UpdateBasicDataRequest {
  firstName: string
  lastName: string
  phone?: string
  location?: string
  portfolioLinks: string[]
}
```

**Response**:
```typescript
interface UpdateResponse {
  success: boolean
  profile?: UserProfile
  error?: string
}
```

### PUT /api/profile/experiences/:id
**Purpose**: Update specific experience entry

**Request**:
```typescript
interface UpdateExperienceRequest {
  company: string
  position: string
  startDate: string
  endDate?: string
  bulletPoints: string[]
  freeFormContext: string
}
```

**Response**:
```typescript
interface UpdateResponse {
  success: boolean
  experience?: Experience
  aiSuggestions?: string[]
  error?: string
}
```

### POST /api/profile/generate-suggestions
**Purpose**: Generate AI suggestions for profile content

**Request**:
```typescript
interface GenerateSuggestionsRequest {
  section: 'experience' | 'education' | 'project'
  itemId: string
  freeFormContext: string
  targetJobId?: string  // Optional: job-specific suggestions
}
```

**Response**:
```typescript
interface GenerateSuggestionsResponse {
  success: boolean
  suggestions?: string[]
  error?: string
}
```

## Job Search API

### GET /api/portals
**Purpose**: Get available job portals

**Response**:
```typescript
interface PortalsResponse {
  success: boolean
  portals?: JobPortal[]
  error?: string
}
```

### POST /api/portals
**Purpose**: Configure job portal

**Request**:
```typescript
interface CreatePortalRequest {
  name: string
  baseUrl: string
  scraperConfig: ScraperConfig
}
```

**Response**:
```typescript
interface CreatePortalResponse {
  success: boolean
  portal?: JobPortal
  error?: string
}
```

### POST /api/search/jobs
**Purpose**: Initiate job search across configured portals

**Request**:
```typescript
interface JobSearchRequest {
  portalIds: string[]
  keywords: string[]
  technologies?: string[]
  experienceLevel?: 'entry' | 'mid' | 'senior' | 'lead'
  remoteOnly: boolean
  salaryMin?: number
  salaryMax?: number
  locations?: string[]
}
```

**Response**:
```typescript
interface JobSearchResponse {
  success: boolean
  searchId?: string
  message?: string
  error?: string
}
```

### GET /api/search/jobs/:searchId/status
**Purpose**: Get job search progress and results

**Response**:
```typescript
interface SearchStatusResponse {
  success: boolean
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: {
    total: number
    processed: number
    filtered: number
    analyzed: number
  }
  results?: JobListing[]
  error?: string
}
```

### GET /api/jobs/matches
**Purpose**: Get user's job matches with compatibility scores

**Query Parameters**:
- `limit`: number (default: 20)
- `offset`: number (default: 0)
- `minScore`: number (default: 50)

**Response**:
```typescript
interface JobMatchesResponse {
  success: boolean
  matches?: (JobMatch & {
    job: JobListing
  })[]
  total?: number
  error?: string
}
```

## Application Management API

### POST /api/applications
**Purpose**: Create new application or save job

**Request**:
```typescript
interface CreateApplicationRequest {
  jobId: string
  matchId: string
  status: 'saved' | 'applied'
  notes?: string
}
```

**Response**:
```typescript
interface CreateApplicationResponse {
  success: boolean
  application?: Application
  error?: string
}
```

### PUT /api/applications/:id/status
**Purpose**: Update application status

**Request**:
```typescript
interface UpdateStatusRequest {
  status: Application['status']
  notes?: string
}
```

**Response**:
```typescript
interface UpdateResponse {
  success: boolean
  application?: Application
  error?: string
}
```

### POST /api/applications/:id/generate-cv-suggestions
**Purpose**: Generate CV improvement suggestions for specific job

**Response**:
```typescript
interface GenerateCVSuggestionsResponse {
  success: boolean
  suggestions?: string[]
  highlightedAreas?: string[]
  error?: string
}
```

### POST /api/applications/:id/generate-cover-letter
**Purpose**: Generate personalized cover letter

**Request**:
```typescript
interface GenerateCoverLetterRequest {
  tone?: 'professional' | 'enthusiastic' | 'formal'
  keyPoints?: string[]  // Optional: specific points to emphasize
}
```

**Response**:
```typescript
interface GenerateCoverLetterResponse {
  success: boolean
  coverLetter?: string
  error?: string
}
```

## AI Processing API

### POST /api/ai/analyze-job-compatibility
**Purpose**: Analyze compatibility between user profile and job

**Request**:
```typescript
interface AnalyzeCompatibilityRequest {
  jobId: string
  profileId?: string  // Optional: defaults to current user's profile
}
```

**Response**:
```typescript
interface AnalyzeCompatibilityResponse {
  success: boolean
  match?: JobMatch
  error?: string
}
```

### POST /api/ai/batch-process-jobs
**Purpose**: Process multiple jobs through AI pipeline

**Request**:
```typescript
interface BatchProcessRequest {
  jobIds: string[]
  pipeline: 'prefilter' | 'parse' | 'analyze' | 'full'
}
```

**Response**:
```typescript
interface BatchProcessResponse {
  success: boolean
  batchId?: string
  message?: string
  error?: string
}
```

## Dashboard API

### GET /api/dashboard/stats
**Purpose**: Get user's dashboard statistics

**Response**:
```typescript
interface DashboardStatsResponse {
  success: boolean
  stats?: {
    totalApplications: number
    activeApplications: number
    interviewsScheduled: number
    offersReceived: number
    averageMatchScore: number
    recentActivity: {
      applications: number
      interviews: number
      rejections: number
    }
    topSkills: string[]
    skillGaps: string[]
  }
  error?: string
}
```

### GET /api/dashboard/applications
**Purpose**: Get user's applications with status

**Query Parameters**:
- `status`: Application['status'] | 'all'
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response**:
```typescript
interface ApplicationsResponse {
  success: boolean
  applications?: (Application & {
    job: JobListing
    match: JobMatch
  })[]
  total?: number
  error?: string
}
```

## File Upload API

### POST /api/upload/cv
**Purpose**: Upload CV file for processing

**Request**: `multipart/form-data`
- `file`: CV file (PDF or DOCX)
- `userId`: string (authenticated user's ID)

**Response**:
```typescript
interface FileUploadResponse {
  success: boolean
  fileId?: string
  originalName?: string
  size?: number
  type?: string
  error?: string
}
```

## Error Response Format

All API endpoints follow consistent error response format:

```typescript
interface ErrorResponse {
  success: false
  error: string
  code?: string  // Error code for client handling
  details?: any   // Additional error details
}
```

## Rate Limiting

### Standard Rate Limits
- **Authentication endpoints**: 5 requests per minute
- **Profile management**: 100 requests per minute
- **Job search**: 10 requests per minute per user
- **AI processing**: 20 requests per minute per user
- **File upload**: 5 requests per minute per user

### Premium AI Rate Limits
- **Cover letter generation**: 10 per hour per user
- **CV suggestions**: 20 per hour per user
- **Job compatibility analysis**: 50 per hour per user

## Authentication

All API endpoints (except `/api/auth/signin` and `/api/auth/session`) require:
- **Bearer Token**: JWT token in `Authorization` header
- **Session Validation**: Valid NextAuth.js session
- **User Context**: User ID extracted from session

## Data Validation

All request payloads are validated using Zod schemas matching the TypeScript interfaces defined above. Invalid requests receive `400 Bad Request` with detailed validation errors.

## Pagination

List endpoints support pagination:
- `limit`: Maximum items per page (default: 20, max: 100)
- `offset`: Number of items to skip (default: 0)
- Response includes `total` count for client-side pagination

## Caching

Static data endpoints use caching:
- **Job portals**: 1 hour cache
- **User profile**: 5 minute cache
- **Job listings**: 30 minute cache
- **Dashboard stats**: 10 minute cache

These API contracts provide comprehensive coverage of all system functionality with proper authentication, validation, and error handling.
