# 🚀 Wagner's Job Application Dashboard

Welcome to your central job application command center! This workspace is designed to organize, analyze, and automate your job applications, custom resumes, and cover letters for remote-first positions.

---

## 🛠️ Quick Commands (Chat Commands)

As your AI co-pilot, I will monitor this workspace. You can run the following commands in our chat to trigger workflows:

| Command | Action | Example |
| :--- | :--- | :--- |
| **`/jobDescription [link]`** | Scrapes the job page, creates a folder, scores the potential, and updates this dashboard. | `/jobDescription https://linkedin.com/jobs/view/...` |
| **`/createCV [folder_name]`** | Tailors your master CV to the job and generates print-ready HTML and Markdown. | `/createCV applications/stripe-senior-frontend/` |
| **`/createCoverLetter [folder_name]`** | Drafts a compelling, tailored US-style cover letter in English in the folder. | `/createCoverLetter applications/stripe-senior-frontend/` |

---

## 📊 Job Applications Tracker

Here is the tracking table of all your active and past applications. I will automatically update this table when you run `/jobDescription`.

| Company & Role | Potential | Date Added | Status | Salary & Contract | Links & Assets |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Google Cloud - Sr. Frontend Engineer** | `92/100` | 2026-06-01 | `To Evaluate` | $140k - $170k / Contractor | [Folder](file:///Users/wagnertaiatella/repos/myJobs/applications/google-sr-frontend/) \| [CV HTML](file:///Users/wagnertaiatella/repos/myJobs/applications/google-sr-frontend/resume_customized.html) |
| **Stripe - Full Stack Engineer (AI)** | `95/100` | 2026-06-01 | `Applied` | €120k / B2B Deel | [Folder](file:///Users/wagnertaiatella/repos/myJobs/applications/stripe-fullstack-ai/) \| [CV HTML](file:///Users/wagnertaiatella/repos/myJobs/applications/stripe-fullstack-ai/resume_customized.html) |

*💡 Note: The applications above are placeholder examples. Once you provide a real link, we will begin scraping and populating this tracker with real data!*

---

## 📁 Workspace Directory Structure

- 📂 **`cv/`**: Contains your master resume (`.pdf` and `.docx`).
- 📂 **`skills/`**: Stores AI-agent execution definitions. You can edit the `preferences.md` files to customize CV styles, scoring weights, or letter templates.
- 📂 **`applications/`**: Holds a dedicated folder for each job you apply to, keeping all tailored assets in one place.
