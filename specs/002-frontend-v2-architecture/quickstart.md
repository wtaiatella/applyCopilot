# Phase 1 Quickstart Guide: Local Development

This guide outlines the steps to spin up the ApplyCopilot V2 frontend application for local development.

---

## 1. Prerequisites

Make sure you have the following installed:
* **Node.js** 20+ (Node 22 recommended)
* **npm** 10+
* **Docker** & **Docker Compose** (for running PostgreSQL and Ollama locally)

---

## 2. Setting Up Local Services

Start the database and local LLM services:
```bash
docker-compose up -d
```
*Verify that PostgreSQL is running on port `5432` and Ollama is running on port `11434`.*

---

## 3. Environment Variables Configuration

Create a `/frontend/.env.local` file with the following development settings (do not commit this file):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/applycopilot?schema=public"
NEXTAUTH_SECRET="some-32-character-random-string-for-auth"
NEXTAUTH_URL="http://localhost:3000"

# AI Provider Configurations
AI_PROVIDER_DEFAULT="ollama"
AI_PROVIDER_PARSING="ollama"
AI_PROVIDER_SUMMARIES="gemini"

# API Keys
GEMINI_API_KEY="your-gemini-api-key-here"
RESEND_API_KEY="your-resend-api-key-here"

> **Note**: To activate Gemini: replace `GEMINI_API_KEY` placeholder. To activate Claude: add `CLAUDE_API_KEY=sk-ant-...` to `.env.local`


# Log Levels
LOG_LEVEL="debug"
DEBUG_SAVE_EXTRACTED_TEXT="true"
```

---

## 4. Install Dependencies

Navigate into the `/frontend` directory and install the packages:
```bash
cd frontend
npx -y create-vite-app@latest ./ --help # Just checking options before executing scripts
npm install
```

---

## 5. Database Migrations and Seeding

Run the Prisma migrations and seed default configuration values (such as `SystemConfig` settings):
```bash
# 1. Run migrations
npx prisma migrate dev --name init

# 2. Add pgvector HNSW index
npx prisma db execute --file prisma/add-hnsw-index.sql

# 3. Seed the database
npx prisma db seed
```

---

## 6. Run the Application

Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
