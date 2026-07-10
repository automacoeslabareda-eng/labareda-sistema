# Premium Squads

Pre-built agent squads installed by the `@aiox-squads/core` CLI after Pro license activation.

## Available Squads

| Squad                   | Agents | Description                                                                    |
| ----------------------- | ------ | ------------------------------------------------------------------------------ |
| **aiox-sop**            | 6      | SOP factory, audit, extraction, and machine-readable operational playbooks     |
| **brand**               | 16     | Naming, identity, positioning, narrative, and brand activation systems         |
| **claude-code-mastery** | 8      | Claude Code setup, hooks, MCP, swarm orchestration, and integration guardrails |
| **data**                | 7      | Data intelligence, analytics, segmentation, and measurement workflows          |
| **db-sage**             | 1      | PostgreSQL and Supabase architecture, migrations, RLS, and query optimization  |
| **squad-creator-pro**   | 6      | Meta-squad for creating AI agent squads based on real elite minds              |
| **design**              | 8      | Design System squad — tokens, components, accessibility, DesignOps             |
| **etl-ops**             | 3      | Extraction and transformation pipelines for local and remote content sources   |
| **hormozi**             | 16     | Offers, leads, ads, pricing, retention, and growth systems inspired by Hormozi |
| **spy**                 | 3      | Competitive intelligence, viral content analysis, and benchmark workflows      |
| **squad-creator**       | 1      | Core squad creation, evolution, validation, and ecosystem orchestration        |
| **storytelling**        | 13     | Narrative systems, pitches, storytelling frameworks, and brand communication   |

## How It Works

1. User runs the AIOX installer from `@aiox-squads/core` and activates Pro license
2. `@aiox-squads/pro` is acquired through the signed artifact channel
3. Scaffolder copies all squads from this directory into the user's project `squads/`
4. Agent commands are auto-installed into active IDEs (Claude Code, Codex, Gemini, Cursor)
5. CI validates package and README coverage before the sync PR to `aiox-core`

## Adding New Squads

1. Develop in `private-squads/` (not published)
2. When ready, move to `squads/`
3. Add the squad to the `## Available Squads` table in this file
4. Add the squad to `package.json` `files`
5. Bump version and publish

## Release Guardrails

- `npm run validate:publish-surface` fails if a top-level squad is missing from `package.json` or this README
- `.github/workflows/sync-aiox-core.yml` opens or updates the `aiox-core` PR that advances the `pro` submodule
- Durante a transição de namespace, `@aiox-squads/core` é o pacote core canônico; `aiox-core` permanece apenas como legado/compatibilidade de CLI.
