---
name: copilot-dev
description: Generates the TypeScript scraper strategy file based on a strategy_analysis.md report, including code implementation, imports registration, and test cases setup.
---

# Copilot Dev - Scraper Implementation Skill

Use this skill when the user asks to implement the strategy or mentions the `/copilot-dev` slash command.

## Input Parameters
- **Strategy Analysis Path**: e.g., `debug/portals/Workable/strategy_analysis.md`
- **Output Portal File**: `frontend/src/lib/scraper/portals/<name>.ts`

## Workflow

### 1. Analysis Loading
Read the `strategy_analysis.md` file from the target directory:
- Extract selectors and strategy details.
- Identify the target URL format and pagination technique.

### 2. Strategy Code Generation
Generate the TypeScript file at `frontend/src/lib/scraper/portals/<name>.ts`.
- Set the `portalId` to the lowercased strategy name.
- Implement the `ScraperStrategy` interface cleanly.
- Add robust parsing for:
  - `salaryMin`, `salaryMax`, and `currency`.
  - `locationType` (convert to `"remote"` or `"onsite"`).
  - `postedAt` (convert relative date strings like "3 days ago" into actual dates).
- Ensure error handling is in place for `extractList` and `extractDeep` (log errors with `logger` and let the engine handle them gracefully).

### 3. Registry & Integrations Mapping
Provide the user with the exact diff or changes required to integrate the new strategy:
1. **Agendador (`frontend/src/lib/scraper/queue.ts`)**:
   - Add `import "./portals/<name>";` near the top.
2. **Rota de Testes (`frontend/src/app/api/scrape/test/route.ts`)**:
   - Add `import "@/lib/scraper/portals/<name>";` near the top.
3. **Painel do Usuário (`frontend/src/components/settings/portals/PortalSettingsList.tsx`)**:
   - Add the `<Select.Option value="<name>"><name></Select.Option>` tag inside the Strategy selector.

### 4. Verification Check
Remind the agent to run these validations before finishing:
- Run `npm test tests/unit/scraper/strategies.test.ts` to ensure the strategy is registered and passes tests.
- Run `npx eslint frontend/src/lib/scraper/portals/<name>.ts` to clean up lint issues.
