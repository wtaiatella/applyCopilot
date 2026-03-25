# ApplyCopilot Backend - Phase 1

## Setup Instructions

### 1. Create Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your actual configuration
```

### 4. Database Setup
- Install PostgreSQL with pgvector extension
- Create database: `createdb applycopilot`
- Update DATABASE_URL in .env file

### 5. Run the Application
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## Project Structure

```
backend/
├── app/
│   ├── api/          # API endpoints (auth, profile, jobs)
│   ├── core/         # Configuration and logging
│   ├── database/     # Database models and session
│   ├── rag/          # RAG system for embeddings
│   └── services/     # Business logic
├── tools/
│   └── cv/           # CV processing tools
├── uploads/          # File upload storage
├── main.py           # Application entry point
└── requirements.txt  # Python dependencies
```

## API Documentation

Once running, visit `http://localhost:8000/docs` for interactive API documentation.
