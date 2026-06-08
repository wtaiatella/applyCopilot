# Phase 0 Research: ApplyCopilot Frontend V2 Architecture

This document outlines the technical research, rationale, and alternatives considered for the core architectural decisions of the ApplyCopilot Frontend V2.

---

## 1. UI Framework: Next.js 16 + React 19 + Ant Design 6 + shadcn/ui

### Decision
Use Next.js 16 (App Router) with React 19, integrating Ant Design 6 for complex data forms/tables and shadcn/ui for clean visual components. Tailwind CSS 4 will act as the styling bridge.

### Rationale
- Next.js App Router provides native route protection via Edge Middleware, preventing client-side redirect flashes.
- Ant Design 6 provides robust out-of-the-box form validation, date pickers, and dynamic editable tabs (`editableTabs`), saving days of custom development.
- shadcn/ui provides clean, customizable layouts and primitives that fit the premium dark-mode aesthetic.
- Tailwind CSS 4 provides a modern build system with first-class CSS custom properties support.

### Alternatives Considered
- **Zustand / Redux**: Rejected for state management because React Context organized by domain (Profile, Job, Application) is sufficient and carries zero dependency overhead. Zustand remains a fallback if rendering bottlenecks occur.
- **Pure shadcn/ui**: Rejected because custom-building complex table editing and tab management (e.g., editable company names in tabs) requires substantial manual component composition.

---

## 2. Database: PostgreSQL 18 + pgvector + Prisma 7.x

### Decision
Use PostgreSQL 18 with the `pgvector` extension. Prisma 7.x will act as the ORM. Vector scoring will use **Cosine Distance** (`<=>`), optimized with an **HNSW** (Hierarchical Navigable Small World) index on the vector embedding column.

### Rationale
- PostgreSQL is the repository's relational database, ensuring ACID compliance for atomic profile operations (saving experiences, bullets, and summaries in single transactions).
- `pgvector` enables vector similarity search for job matching directly in SQL.
- Prisma 7.x provides stable PostgreSQL support, typed queries, and schema migration features.
- Cosine Distance is the industry standard for text embedding similarity (e.g., OpenAI, Gemini, Cohere).
- HNSW indexes provide superior recall and search latency compared to IVFFlat for high-dimensional vectors.

### Alternatives Considered
- **Pinecone / Milvus**: Rejected because a dedicated vector database introduces operational complexity, sync latency, and higher pricing, whereas pgvector keeps relational and vector data in a single transactional database.

---

## 3. Real-time Streaming: Server-Sent Events (SSE)

### Decision
Implement SSE using a standard route handler `/api/profile/parse` streaming text/event-stream.

### Rationale
- SSE allows streaming progress updates (upload -> basic data -> experiences -> projects -> education) to the client over a single HTTP connection.
- Unlike WebSockets, SSE runs over standard HTTP, supports automatic reconnection, is simpler to configure behind proxies, and does not require a persistent socket server.

### Alternatives Considered
- **REST Polling**: Rejected due to high overhead, database load, and lack of real-time responsiveness.
- **WebSockets**: Rejected because bidirectionality is not required (data flow is one-way from server to client during parsing).

---

## 4. Text Extraction: Mammoth (DOCX) + pdf2json (PDF)

### Decision
Extract text in-memory on the Node.js server using `mammoth` for Word documents and `pdf2json` for PDF files.

### Rationale
- Mammoth extracts clean, semantic HTML/Markdown from Word documents.
- `pdf2json` is a pure JavaScript PDF parser that runs efficiently in-memory without external native binaries (e.g., pdftotext), facilitating simple Docker container packaging.

### Alternatives Considered
- **Cloud-based document parsers (e.g., AWS Textract)**: Rejected due to cost, privacy requirements (data processed locally where possible), and network latency.
