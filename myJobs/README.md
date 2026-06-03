# 🚀 Wagner's Job Application Dashboard

Welcome to your central job application command center! This workspace is designed to organize, analyze, and automate your job applications, custom resumes, and cover letters for remote-first positions.

---

## 🛠️ Quick Commands (Chat Commands)

As your AI co-pilot, I will monitor this workspace. You can run the following commands in our chat to trigger workflows:

| Command | Action | Example |
| :--- | :--- | :--- |
| **`/importCV`** | Analisa a pasta `cv/` e separa de forma inteligente seus dados na pasta modular `myData/`. | `/importCV` |
| **`/interviewMe`** | Entrevistador de RH amigável que faz perguntas para enriquecer seus dados em `myData/` com métricas STAR. | `/interviewMe` |
| **`/jobDescription [link]`** | Scrapes the job page, creates a folder, scores the potential, and updates this dashboard. | `/jobDescription https://linkedin.com/jobs/view/...` |
| **`/createCV [folder_name]`** | Tailors your master CV to the job and generates print-ready HTML and Markdown. | `/createCV applications/stripe-senior-frontend/` |
| **`/createCoverLetter [folder_name]`** | Drafts a compelling, tailored US-style cover letter in English in the folder. | `/createCoverLetter applications/stripe-senior-frontend/` |

---

## 📊 Job Applications Tracker

Here is the tracking table of all your active and past applications. I will automatically update this table when you run `/jobDescription`.

| Company & Role | Potential | Date Added | Status | Salary & Contract | Links & Assets |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Constructor.io - Full Stack Engineer (Agent Tools)** | `98/100` | 2026-06-01 | `To Evaluate` | $80k - $110k / Remote | [Folder](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/constructor-fullstack-agent-tools/) \| [Evaluation](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/constructor-fullstack-agent-tools/analysis.md) |
| **Google Cloud - Sr. Frontend Engineer** | `92/100` | 2026-06-01 | `To Evaluate` | $140k - $170k / Contractor | [Folder](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/google-sr-frontend/) \| [CV HTML](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/google-sr-frontend/resume_customized.html) |
| **Stripe - Full Stack Engineer (AI)** | `95/100` | 2026-06-01 | `Applied` | €120k / B2B Deel | [Folder](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/stripe-fullstack-ai/) \| [CV HTML](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/stripe-fullstack-ai/resume_customized.html) |
| **Giant Swarm - Frontend Engineer (100% Remote)** | `55/100` | 2026-06-02 | `To Evaluate` | Not specified / Full-time (32h) | [Folder](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/giant-swarm-frontend-engineer/) \| [Evaluation](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/giant-swarm-frontend-engineer/analysis.md) |
| **Lumenalta - Javascript Fullstack Engineer - Senior** | `42/100` | 2026-06-02 | `To Evaluate` | Not specified / Contractor | [Folder](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/lumenalta-javascript-fullstack-engineer-senior/) \| [Evaluation](file:///Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/lumenalta-javascript-fullstack-engineer-senior/analysis.md) |

*💡 Note: The applications above are placeholder examples. Once you provide a real link, we will begin scraping and populating this tracker with real data!*

---

## 📁 Workspace Directory Structure

- 📂 **`cv/`**: Contém seus currículos originais em formato `.pdf` e `.docx`.
- 📂 **`myData/`**: A sua base de dados de carreira modularizada (resumos, experiências profissionais divididas por arquivo, educações e informações extras).
- 📂 **`applications/`**: Pasta dedicada para cada candidatura realizada, agrupando os assets customizados gerados.
- 📂 **`skills/`**: Modelos de preferências e configurações de habilidades de IA.
- 📂 **`scripts/`**: Scripts técnicos e automatizadores auxiliares (ex: extrator de textos em PDF/Docx).
