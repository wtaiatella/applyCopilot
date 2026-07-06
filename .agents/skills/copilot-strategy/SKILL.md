---
name: copilot-strategy
description: Analyzes scraper debug resources (HTML listings, cURL files) for a target portal and defines the data extraction strategy before writing code.
---

# Copilot Strategy - Portal Analyzer Skill

Use this skill when the user asks to analyze a job portal for scraping or mentions the `/copilot-strategy` slash command.

## Input Parameters
- **Portal Folder Path**: e.g., `debug/portals/Workable`
- **Scrape Target URL**: The URL used to search or read jobs on that portal.

## Workflow

### 1. Source Discovery
Examine all the files inside the provided portal folder:
- Search for `.html` files containing the layout of the job listing.
- Search for files named `cURL` or `curl` containing the HTTP request syntax.
- use any other files that may help you.

### 2. Difficulty & Protection Evaluation
Check for signs of security systems:
- Does the cURL command contain active session cookies (`datadome=...`, `__cf_bm=...`)?
- Does the target portal block simple Node/Fetch requests?
- Categorize the scraping difficulty level from 1 (direct HTML fetch) to 6 (advanced anti-bot proxies required).

### 3. Data Source Mapping
Determine the best source of extraction:
- **State Hydration**: Is there an internal React/Next.js script block (e.g. JSON inside `<script>`) containing the jobs?
- **HTML DOM**: Do we need to parse CSS classes (`.job-card`, etc.)?
- **Internal APIs**: Can we query their backend API directly?

### 4. Step-by-Step Fields Definition
Identify which fields can be extracted in each phase and map them to the schema fields.

## Database Schema Reference (`JobListing`)

Your strategy analysis and extraction selectors MUST explicitly map to these database schema fields defined in `frontend/prisma/schema.prisma`:
- **`externalJobId` (String)**: Unique ID of the job on the target portal (required).
- **`title` (String)**: Title of the job posting (required).
- **`company` (String)**: Name of the company hiring (required).
- **`location` (String?)**: Text description of the location (e.g., "San Francisco, CA").
- **`url` (String)**: Direct URL to the job details page (required).
- **`isFullDescriptionFetched` (Boolean)**: Set to `false` in `extractList`, then `true` after `extractDeep`.
- **`fullDescription` (String?)**: Full markdown content of the description.
- **`locationType` (String?)**: Classify as `"remote"`, `"onsite"`, or `"hybrid"`.
- **`countries` (String?)**: Country name if discernible.
- **`jobType` (String?)**: E.g., `"Full-time"`, `"Part-time"`, `"Contract"`, `"Internship"`.
- **`experienceLevel` (String?)**: Experience description (e.g., `"5 years of exp"`).
- **`postedAt` (DateTime?)**: Relative time conversion (e.g., `"3 days ago"` to date).
- **`salaryMin` (Float?)**: Minimum salary value.
- **`salaryMax` (Float?)**: Maximum salary value.
- **`currency` (String?)**: E.g., `"USD"`, `"BRL"`, `"EUR"`.

## Expected Output
Generate a strategy analysis markdown file named `strategy_analysis.md` inside the target portal folder (e.g., `debug/portals/<PortalName>/strategy_analysis.md`).

The output markdown MUST follow this template:
```markdown
# Scraper Strategy Analysis: [Portal Name]

## 1. Technical Evaluation
- **Target URL**: [URL]
- **Estimated Difficulty**: [Level 1 to 6]
- **Anti-Bot Protections Detected**: [None / Cloudflare / Datadome / etc.]
- **Scraping Feasibility**: [Feasible / Unfeasible / Local-Only]

## 2. Data Sources
- **List Extraction Method**: [Hydrated script state JSON / HTML DOM Parsing / Internal API]
- **Deep Extraction Method**: [JSON-LD / Fallback selector / Direct API]

## 3. Database Schema Mappings

### Step 1: extractList (Listings Page)
Map each field to its CSS selector, script JSON path, or mapping function:
- **`externalJobId`**: [Selector / Path]
- **`title`**: [Selector / Path]
- **`company`**: [Selector / Path]
- **`url`**: [Selector / Path]
- **`location`**: [Selector / Path]
- **`locationType`**: [Selector / Logic]
- **`countries`**: [Selector / Path]
- **`jobType`**: [Selector / Path]
- **`experienceLevel`**: [Selector / Path]
- **`postedAt`**: [Selector / Logic]
- **`salaryMin`**: [Selector / Logic]
- **`salaryMax`**: [Selector / Logic]
- **`currency`**: [Selector / Logic]
- **`isFullDescriptionFetched`**: Always set to `false` during list step.
- **Requires Deep Fetch**: [Yes/No]

### Step 2: extractDeep (Job Details Page)
- **`fullDescription`**: [Selector / JSON path to markdown converter]
- **Fallback selector**: [Selector used if JSON-LD is missing]

## 4. Risks & Caveats
- [List any structural changes, pagination limits, cookie expirations, etc.]
```
