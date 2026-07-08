# API Contracts: Job Classification & Matching

This document defines the HTTP endpoints introduced or modified for Spec 004.

---

## 1. GET /api/jobs (Retrieve & Rank Vacancies)

Fetches active job listings, dynamically ranking them by semantic similarity against the user's profile.

*   **URL**: `/api/jobs`
*   **Method**: `GET`
*   **Authentication**: Session cookie (NextAuth) required.
*   **Query Parameters**:
    *   `days`: Integer. Max age of jobs in days (default: `15`).
    *   `limit`: Integer. Max number of jobs to return (default: `50`).
    *   `minMatch`: Integer. Minimum similarity score threshold (0-100) (optional).

### Response: Synced Profile (Success 200 OK)
```json
[
  {
    "id": "clw1234567890abcdef",
    "title": "Senior React Developer",
    "company": "Tech Corp",
    "location": "Remote, US",
    "postedAt": "2026-07-06T12:00:00.000Z",
    "url": "https://apply.workable.com/techcorp/j/123",
    "matchScore": 84.5
  },
  {
    "id": "clw0987654321fedcba",
    "title": "Fullstack Engineer (React/Node)",
    "company": "SaaS Inc",
    "location": "Boston, MA",
    "postedAt": "2026-07-05T09:30:00.000Z",
    "url": "https://apply.workable.com/saasinc/j/456",
    "matchScore": 62.1
  }
]
```

### Response: Un-synced Profile (Success 200 OK)
If `UserProfile.embedding` is `null`, returns listings ordered by creation/post date descending with `matchScore` set to `null`.
```json
[
  {
    "id": "clw1234567890abcdef",
    "title": "Senior React Developer",
    "company": "Tech Corp",
    "location": "Remote, US",
    "postedAt": "2026-07-06T12:00:00.000Z",
    "url": "https://apply.workable.com/techcorp/j/123",
    "matchScore": null
  }
]
```

---

## 2. POST /api/profile/sync (Profile Clean & Vectorize)

Manually triggers the LLM (Summaries Provider) to clean the CV profile data and regenerates the 512-dimension local vector.

*   **URL**: `/api/profile/sync`
*   **Method**: `POST`
*   **Authentication**: Session cookie required.
*   **Payload**: None (reads the currently authenticated user's profile from the DB).

### Response (Success 200 OK)
```json
{
  "success": true,
  "embeddingSyncedAt": "2026-07-07T08:30:00.000Z",
  "aiCleanedText": "Candidate Title: Senior React Developer\nSkills: React, Next.js, Node.js, PostgreSQL...\nYears of Experience: 5 years..."
}
```

---

## 3. POST /api/jobs/:id/analyze (Deep AI Analysis)

Evaluates the raw candidate profile against the raw job description. Reuses cached results if available.

*   **URL**: `/api/jobs/:id/analyze`
*   **Method**: `POST`
*   **Authentication**: Session cookie required.
*   **URL Parameters**:
    *   `id`: String. The unique `id` of the `JobListing`.
*   **Payload**: None (loads profile and job description internally from DB).

### Response (Success 200 OK)
```json
{
  "jobId": "clw1234567890abcdef",
  "strengths": [
    "5 years of experience in React aligns with the request for senior experience.",
    "Strong expertise in PostgreSQL matching backend database requirements."
  ],
  "weaknesses": [
    "No explicit experience listed for Kubernetes, which is listed as nice-to-have."
  ],
  "missingSkills": [
    "Kubernetes",
    "GraphQL"
  ],
  "verdict": "APPLY",
  "justification": "The candidate has high affinity with the primary technical stack (React/Node). The missing skills are non-blockers (listed as nice-to-haves). Highly recommended to apply."
}
```
*Note: Subsequent requests for this same ID will load this exact payload from database cache in <100ms.*
