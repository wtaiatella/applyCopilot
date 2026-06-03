---
name: "importCV"
description: "Scans myJobs/cv/ for PDF/Word/Markdown resumes, extracts text using scripts/parse_cv.py, and distributes the data into the structured myData/ folders."
---

# Skill: Import CV (/importCV)

This skill guides the AI agent on how to scan and parse the user's legacy resume files and distribute their contents into the modular, structured `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/` directories.

## Command Trigger
`[Qualquer mensagem que mencione "/importCV"]`

## Execution Steps

When this skill is triggered, the agent must perform the following steps:

### 1. Scan the CV Directory
* Look for all files in `/Users/wagnertaiatella/repos/applyCopilot/myJobs/cv/`.
* Acceptable formats: `.pdf`, `.docx`, `.md`, `.txt`.
* If the directory is empty, inform the user and request them to upload or place their resumes in that directory.

### 2. Extract Text Contents
* For `.md`, `.txt`, and `.markdown` files, read the content directly using the file viewing tools.
* For `.pdf` and `.docx` files, use the `run_command` tool to execute:
  ```bash
  python3 /Users/wagnertaiatella/repos/applyCopilot/myJobs/scripts/parse_cv.py "/Users/wagnertaiatella/repos/applyCopilot/myJobs/cv/<filename>"
  ```
  And capture the returned text content.

### 3. Analyze and Segment the Content
Use your advanced language understanding capabilities to segment the extracted text into the following career components:

#### A. Contact & Summary
* Extract contact info (phone, email, links to LinkedIn/GitHub/Portfolio) and the generic "Summary" text.
* Write this data to a new file `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/summary/summary_master.md` following this structure:
  ```markdown
  # Wagner Taiatella - Informações Pessoais & Resumos

  ## Contato
  * **Email**: [email]
  * **Telefone**: [phone]
  * **LinkedIn**: [url]
  * **GitHub**: [url]
  * **Website**: [url]
  * **Localização**: Florianópolis, SC - Brazil (Remote availability)

  ## Resumo Master
  [Insert master summary paragraph here]
  ```

#### B. Experiences (Professional History)
* Extract each professional experience (Job Title, Company, Date Range, Location, and Description bullets).
* For **each unique experience**, create a dedicated file: `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/experiences/<company-slug>.md` (e.g., `avalara.md`, `siemens.md`, `energisa.md`, `self_employed.md`).
* Format each file precisely using the following layout:
  ```markdown
  # Experiência: [Cargo] na [Empresa]

  ## Informações Gerais
  * **Empresa**: [Company Name]
  * **Cargo**: [Job Title]
  * **Período**: [Date Range]
  * **Localização / Modelo**: [Location, e.g., Remote, On-site]

  ## Conquistas Formais (Resume Bullets)
  [Insert the formal bullet points exactly as extracted from the CV]

  ## Tecnologias Utilizadas
  * [Bullet list of technologies mentioned in this specific role]

  ## Detalhes Complementares (Bastidores)
  *Este espaço é reservado para as histórias de bastidores, desafios superados e métricas técnicas detalhadas que serão levantadas durante o comando /interviewMe.*
  ```

#### C. Education
* Extract all academic degrees, bootcamps, and specialized courses.
* Write them to a single file `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/educations/education.md` in reverse-chronological order:
  ```markdown
  # Formação Acadêmica & Cursos

  ## Cursos & Bootcamps
  * **[Bootcamp/Course Title]** - [Institution] ([Dates])
    * [Short description or key topics, if available]

  ## Formação Acadêmica
  * **[Degree Name]** - [University/Institution] ([Dates])
  ```

#### D. Others (Languages, Skills, Activities)
* Extract spoken languages, volunteer activities, global skill categories, or other achievements.
* Write this data to `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/others/others.md`:
  ```markdown
  # Informações Adicionais

  ## Idiomas
  * **[Language Name]**: [Proficiency]

  ## Trabalho Voluntário
  * [Volunteer activities, e.g., Scoutmaster]

  ## Habilidades Gerais
  * [List of general soft/hard skills mentioned]
  ```

### 4. Chat Confirmation
* Respond to the user with a summary of the parsing process.
* List all the files created inside `/Users/wagnertaiatella/repos/applyCopilot/myJobs/myData/` with absolute links so the user can easily view or edit them.
* Suggest running `/interviewMe` as the next step to start enriching the blank background narratives!
