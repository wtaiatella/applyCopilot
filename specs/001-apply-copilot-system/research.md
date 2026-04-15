# Research Findings: ApplyCopilot Job Search Automation System

**Date**: 2025-06-17  
**Purpose**: Research technical decisions and best practices for implementation

## CV Processing and Document Parsing

### Decision: Use PDF-parse for PDF extraction, mammoth.js for DOCX
**Rationale**: 
- `pdf-parse` is a mature Node.js library with excellent text extraction accuracy
- `mammoth.js` is specifically designed for DOCX parsing with robust handling of complex documents
- Both libraries are lightweight and can be run server-side with Next.js

**Alternatives Considered**:
- `pdf2pic` + OCR: Too heavy for text extraction, overkill for structured CVs
- `docx-parser`: Less maintained, fewer features than mammoth.js
- Cloud-based parsing (Google Docs API): Violates privacy-by-default principle

## Job Scraping Architecture

### Decision: Playwright for web scraping with Cheerio for HTML parsing
**Rationale**:
- Playwright handles modern JavaScript-heavy sites and anti-bot measures
- Cheerio provides fast, jQuery-like HTML parsing for structured data extraction
- Combination allows both dynamic content loading and efficient parsing

**Alternatives Considered**:
- Puppeteer: Similar capabilities but Playwright has better cross-browser support
- Axios + Cheerio only: Insufficient for JavaScript-rendered content
- Scrapy (Python): Would require separate Python service, adds complexity

## AI Processing Pipeline

### TensorFlow.js for Pre-filtering
**Decision**: Use cosine similarity with TF-IDF vectorization
**Rationale**: 
- Lightweight mathematical approach perfect for initial compatibility scoring
- Can be run entirely client-side or server-side without external dependencies
- TF-IDF + cosine similarity is well-established for document similarity

### Ollama Integration
**Decision**: Use Llama 3.2 3B for structured data extraction
**Rationale**:
- Llama 3.2 3B provides excellent balance of performance and resource usage
- Small enough to run locally on modest hardware
- Strong capabilities for JSON-structured output and text transformation

### Premium AI Selection
**Decision**: Use Gemini 1.5 Flash for high-complexity tasks
**Rationale**:
- Gemini 1.5 Flash offers best price-to-performance ratio for content generation
- Superior at understanding context and generating personalized content
- Faster response times compared to GPT-4 for similar quality

## Database Schema Design

### Decision: MongoDB with Prisma ORM
**Rationale**:
- MongoDB's flexible schema accommodates varied CV structures and job listing formats
- Prisma provides type-safe database access and excellent TypeScript integration
- Good performance for read-heavy workloads (job searches, profile viewing)

**Alternatives Considered**:
- PostgreSQL: More rigid schema, less suitable for unstructured CV data
- Direct MongoDB driver: Loses type safety and development ergonomics of Prisma

## Authentication Strategy

### Decision: NextAuth.js with Credentials + Google providers
**Rationale**:
- NextAuth.js is constitution-mandated and provides comprehensive auth solution
- Credentials provider for email/password authentication
- Google provider for social login convenience
- Built-in session management and security features

## UI Framework Integration

### Decision: Ant Design 6 + Tailwind CSS 4
**Rationale**:
- Ant Design 6 provides comprehensive component library with excellent accessibility
- Tailwind CSS 4 offers modern utility-first styling approach
- Constitution-mandated combination with proven track record

### Dark Mode Implementation
**Decision**: Use Ant Design's ConfigProvider with custom theme tokens
**Rationale**:
- Ant Design's built-in theming system handles dark mode consistently
- ConfigProvider allows application-wide theme switching
- Maintains component consistency across light/dark modes

## Performance Optimization

### Decision: Implement caching with Redis for job search results
**Rationale**:
- Redis provides fast in-memory caching for frequently accessed job data
- Reduces load on AI processing pipeline for repeated searches
- Improves user experience with faster response times

### File Upload Strategy
**Decision**: Use temporary file storage with automatic cleanup
**Rationale**:
- CV files only needed during processing, not for long-term storage
- Reduces storage costs and complies with privacy principles
- Automatic cleanup prevents disk space issues

## Testing Strategy

### Decision: Jest for unit tests, Playwright for e2e tests
**Rationale**:
- Jest is the standard for TypeScript/Next.js unit testing
- Playwright provides excellent cross-browser e2e testing capabilities
- Both integrate well with Next.js and TypeScript

## Deployment Architecture

### Decision: Docker Compose for local development
**Rationale**:
- Simplifies local development environment setup
- Consistent environments across development machines
- Easy to spin up required services (MongoDB, Ollama, Redis)

### Future Migration Target
**Decision**: Akamai bare-metal server for production
**Rationale**:
- Better control over AI processing hardware
- Cost-effective for high-volume AI workloads
- Direct control over networking and security configurations

## Security Considerations

### File Upload Security
**Decision**: Implement file type validation, size limits, and virus scanning
**Rationale**:
- Prevent malicious file uploads
- Control storage costs and processing time
- Protect system integrity

### API Rate Limiting
**Decision**: Implement rate limiting for AI service calls
**Rationale**:
- Control costs associated with premium AI usage
- Prevent abuse and ensure fair usage
- Protect against DoS attacks

## Monitoring and Observability

### Decision: Use Winston for logging, Prometheus for metrics
**Rationale**:
- Winston provides flexible logging with multiple output options
- Prometheus offers industry-standard metrics collection
- Both integrate well with Next.js applications

## Cost Optimization Strategies

### AI Pipeline Optimization
**Decision**: Implement intelligent caching and batching
**Rationale**:
- Cache AI responses for similar requests
- Batch multiple small requests into single API calls
- Implement smart retry logic with exponential backoff

### Resource Management
**Decision**: Use serverless functions for sporadic workloads
**Rationale**:
- Cost-effective for infrequent CV processing
- Automatic scaling based on demand
- No idle resource costs

## Summary

All technical decisions align with the constitution requirements and project constraints. The research phase has identified optimal solutions for each major component, with clear justification for each choice. The architecture prioritizes privacy, cost optimization, and user experience while maintaining scalability and security.
