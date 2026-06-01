# Skill: Create Cover Letter (/createCoverLetter)

This skill guides the AI agent on how to draft a highly tailored, professional cover letter (carta de apresentação) for Wagner Taiatella for a specific job application.

## Command Trigger
`[Qualquer mensagem que mencione "/createCoverLetter" seguido pelo caminho/nome da pasta da candidatura]`

## Process Steps

When this skill is triggered, the agent must perform the following steps:

1. **Read Job Details**:
   - Locate the application folder: `/Users/wagnertaiatella/repos/myJobs/applications/<folder-name>/`.
   - Read `job_description.md` to identify:
     - Company Name, culture, and products/services.
     - Role requirements, main challenge, and team focus.
     - Recruiter or hiring manager name (if available).

2. **Read Master Background & Preferences**:
   - Read Wagner's background details and cover letter guidelines from `/Users/wagnertaiatella/repos/myJobs/skills/create_cover_letter/preferences.md`.
   - Review any custom rules, tone preferences, or templates added by Wagner.

3. **Draft a Tailored Cover Letter**:
   - **Always write in English**.
   - Use an **elegant, confident, and professional tone** (no generic clichés, no subservient addresses).
   - Structure of the letter:
     - **Header**: Standard professional header with contact details, date, and company details.
     - **Hook**: Address the company directly, express excitement for their mission/product, and state how Wagner's unique background matches their core challenge.
     - **Core Body 1 (Web Engineering & AI)**: Connect current work at Avalara (AI log analysis, cloud scaling) or contract projects with the specific technical challenges of the job.
     - **Core Body 2 (The Reliability Edge)**: Highlight the **20 years of critical systems engineering** as a unique reliability edge. Explain how designing substation automation systems (for Siemens/Energisa) taught him to build software where failures are not an option, translating into extremely stable, performant, and well-tested web systems.
     - **Closing**: Strong call to action, welcoming a technical interview to discuss how he can add value.
     - **Sign-off**: Respectful professional closing.

4. **Save the File**:
   - Save the finalized cover letter in Markdown to `/Users/wagnertaiatella/repos/myJobs/applications/<folder-name>/cover_letter.md`.

5. **Confirm and Present**:
   - Notify the user that the cover letter has been generated.
   - Display a preview of the cover letter in the chat window so they can read it immediately.
