---
name: "createCV"
description: "Tailors Wagner's master CV to a specific job description, generating both Markdown and print-ready HTML."
---

# Skill: Customize CV (/createCV)

This skill guides the AI agent on how to customize Wagner Taiatella's master CV to fit a specific job application, outputting both Markdown and highly-presentable print-ready HTML.

## Command Trigger
`[Qualquer mensagem que mencione "/createCV" seguido pelo caminho/nome da pasta da candidatura]`

## Process Steps

When this skill is triggered, the agent must perform the following steps:

1. **Read Job Details**:
   - Locate the application folder: `/Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/<folder-name>/`.
   - Read the `job_description.md` to identify primary keywords, critical technologies, and challenges the role seeks to solve.

2. **Read Master CV & Preferences**:
   - Read the master CV (extracted in our initial chat or referenced in `/Users/wagnertaiatella/repos/applyCopilot/myJobs/skills/customize_cv/preferences.md`).
   - Read the user's custom CV instructions in `/Users/wagnertaiatella/repos/applyCopilot/myJobs/skills/customize_cv/preferences.md` (which Wagner can update over time with instructions like "emphasize Java more", "rephrase my Siemens achievements", etc.).

3. **Perform Strategic Tailoring**:
   - Focus the **Summary** to match the core challenge of the target job.
   - Adjust and reorder the **Experience bullet points**:
     - Emphasize the achievements that directly solve the target company's pain points.
     - Ensure the vocabulary matches the job posting keywords (e.g. if the job asks for "system scaling", highlight scaling achievements).
     - Keep the experience historical timeline factual and unchanged.
     - Ensure the output is **always in English**.

4. **Generate the Files**:
   - **Markdown Version**: Save to `applications/<folder-name>/resume_customized.md`.
   - **Print-ready HTML Version**:
     - Load the base printable template from `/Users/wagnertaiatella/repos/applyCopilot/myJobs/skills/customize_cv/templates/resume_print_template.html`.
     - Replace the placeholder details with the tailored content (header, summary, experiences, education, additional info).
     - Ensure the HTML is fully self-contained (no external local CSS files, only Google Fonts links) so that the user can open it instantly in any browser.
     - Save to `applications/<folder-name>/resume_customized.html`.

5. **Confirm and Instruct**:
   - Confirm to the user that the CV has been generated in both `.md` and `.html` formats.
   - Provide quick, clear instructions on how they can preview the HTML file in their browser and use "Print -> Save as PDF" with ideal margins (e.g., margins set to "None" or "Default", landscape/portrait options) to get a beautiful, print-ready PDF resume.
