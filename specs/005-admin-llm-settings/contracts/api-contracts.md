# API Contracts: Admin LLM Configuration

**Feature**: `005-admin-llm-settings`  
**Date**: 2026-06-15  
**Base URL**: `/api/admin`

---

## Authentication

All routes in `/api/admin/*` require:
- Valid NextAuth session
- `session.user.role === "ADMIN"` — non-admin requests return `403 Forbidden`

---

## Routes

### GET `/api/admin/llm-config`

Retrieves the current LLM provider configuration and credential status for all three capabilities.

**Auth**: Required (ADMIN only)

**Request**: No body

**Response 200**:
```json
{
  "config": {
    "defaultProvider": "ollama",
    "parsingProvider": "ollama",
    "summariesProvider": "gemini"
  },
  "credentialStatus": {
    "ollama": true,
    "gemini": false,
    "claude": false
  }
}
```

**Response 401**: Session missing or invalid
```json
{ "error": "Unauthorized" }
```

**Response 403**: Authenticated but not ADMIN
```json
{ "error": "Forbidden" }
```

**Response 500**: Database unavailable
```json
{ "error": "Failed to load configuration" }
```

---

### POST `/api/admin/llm-config`

Updates the LLM provider selection for all three capabilities.

**Auth**: Required (ADMIN only)

**Request Body**:
```json
{
  "defaultProvider": "ollama",
  "parsingProvider": "gemini",
  "summariesProvider": "gemini"
}
```

**Validation**:
- All three fields required
- Each value must be one of: `ollama`, `gemini`, `claude`
- Zod schema used for validation

**Response 200**:
```json
{
  "success": true,
  "updated": {
    "defaultProvider": "ollama",
    "parsingProvider": "gemini",
    "summariesProvider": "gemini"
  }
}
```

**Response 400**: Validation failure
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "parsingProvider", "message": "Must be one of: ollama, gemini, claude" }
  ]
}
```

**Response 401**: Session missing
```json
{ "error": "Unauthorized" }
```

**Response 403**: Not ADMIN
```json
{ "error": "Forbidden" }
```

**Response 500**: Database write failure
```json
{ "error": "Failed to update configuration" }
```

---

## Implementation Notes

- Uses Prisma `upsert` for each key to handle both insert and update scenarios
- Changes to `SystemConfig` take effect immediately — `aiClient.ts` reads DB on every AI call (no caching)
- All write operations are logged via Winston at INFO level
- Zod validation schema in `src/lib/validation/adminSchemas.ts`
