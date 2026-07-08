# API Contracts: Job Discovery & Scraper Worker

This document defines the HTTP endpoints for managing Portal Search URLs and interacting with the scraper tasks. All endpoints require an active NextAuth session. The `/api/settings/*` routes specifically require the `ADMIN` role, as established in the 005 spec.

## 1. Portal Settings Management

### `GET /api/settings/portals`
Retrieves all configured portal search URLs.
- **Auth**: Required (`ADMIN`)
- **Request Body**: None
- **Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "cuid...",
      "portalId": "linkedin",
      "url": "https://www.linkedin.com/jobs/search?keywords=React...",
      "name": "LinkedIn React Remote",
      "isActive": true,
      "status": "ACTIVE",
      "isRobotsBlocked": false
    }
  ]
}
```

### `POST /api/settings/portals`
Adds a new search URL for a portal.
- **Auth**: Required (`ADMIN`)
- **Request Body**:
```json
{
  "portalId": "string",
  "url": "string (URL)",
  "name": "string"
}
```
- **Response**: `201 Created` with the created `PortalSearchUrlDTO`.
```json
{
  "id": "cuid...",
  "portalId": "linkedin",
  "url": "https://www.linkedin.com/jobs/search?keywords=React...",
  "name": "LinkedIn React Remote",
  "isActive": true,
  "status": "ACTIVE",
  "isRobotsBlocked": false
}
```

### `PUT /api/settings/portals/:id`
Updates an existing search URL (e.g., toggling `isActive`).
- **Auth**: Required (`ADMIN`)
- **Request Body**: Partial `PortalSearchUrlDTO` (e.g., `{ "isActive": false }` or `{ "status": "DISABLED" }`)
- **Response**: `200 OK` with updated DTO.

### `DELETE /api/settings/portals/:id`
Removes a search URL configuration.
- **Auth**: Required (`ADMIN`)
- **Response**: `204 No Content`

---

## 2. Manual Scrape & Worker Monitoring

### `POST /api/scrape/manual`
Manually queues a scrape task for a given portal with specific keywords. This bypasses the predefined URLs in settings.
- **Auth**: Required (`USER` or `ADMIN`)
- **Request Body**:
```json
{
  "portalId": "string",
  "url": "string (URL)"
}
```
- **Response**: `202 Accepted`
```json
{
  "taskId": "cuid...",
  "message": "Scrape task queued successfully."
}
```

### `GET /api/scrape/stream`
Server-Sent Events (SSE) endpoint to monitor the progress of manual scrape tasks.
- **Auth**: Required (`USER` or `ADMIN`)
- **Response**: `text/event-stream`
```text
event: taskProgress
data: {"taskId": "cuid...", "status": "RUNNING", "progress": 50, "resultsCount": 12}

event: taskProgress
data: {"taskId": "cuid...", "status": "COMPLETED", "progress": 100, "resultsCount": 24}
```
