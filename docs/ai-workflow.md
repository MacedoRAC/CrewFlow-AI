# CrewFlow AI

An autonomous, AI-driven engineering crew powered by OpenCode / Claude Code.
GitHub Issues, Pull Requests and comments are the orchestration layer; the AI
agent performs all reasoning and implementation. No direct Anthropic API
integration is required.

> Works with any repository. Designed initially for Laravel + Vue + TypeScript,
> but the discovery scripts and prompts are framework-agnostic.

---

## Table of Contents

- [Workflow Overview](#workflow-overview)
- [Architecture](#architecture)
- [Agents](#agents)
- [Slash Commands](#slash-commands)
- [Directory Structure](#directory-structure)
- [Configuration](#configuration)
- [Labels / State Machine](#labels--state-machine)
- [Adding a New Agent](#adding-a-new-agent)
- [Custom Prompts](#custom-prompts)
- [Troubleshooting](#troubleshooting)
- [Installation](#installation)
- [Security Considerations](#security-considerations)

---

## Workflow Overview

```text
Issue Created
      │
      ▼
Automatic Analysis  (issue-analysis.yml → planner → architect)
      │
      ▼
Plan saved to .ai/plans/issue-<n>.md + comment posted
      │
      ▼
Human Review  →  /implement
      │
      ▼
Implementer  (implement.yml → feature branch → PR)
      │
      ▼
Reviewer  (review.yml → GitHub Review)
      │
      ▼
QA  (qa.yml → Ready to Merge / Needs Work)
      │
      ▼
Merge → sync-docs.yml updates .ai/ architecture & memory
```

Every stage is **restartable and idempotent**. Re-running `/analyze` regenerates
the plan; re-running `/implement` continues from the existing branch.

---

## Architecture

The system uses a **reusable workflow** (`_ai-dispatch.yml`) that every agent
shares. Each top-level workflow only handles its trigger, authorization and
label management, then delegates to the shared dispatcher with an `agent`
argument. This keeps logic in one place and makes adding agents trivial.

```text
.github/workflows/
  _ai-dispatch.yml   ← shared: checkout, context build, model resolve, run agent
  issue-analysis.yml ← triggers planner + architect
  implement.yml      ← triggers implementer on /implement
  review.yml         ← triggers reviewer on PR
  qa.yml             ← triggers qa after review
  sync-docs.yml      ← updates memory/docs on merge
```

Before any agent runs, `collect-context.ts` gathers a **compact** view of the
repository (tree, models, services, routes, tests, dependencies, issue
classification) into `.ai/context/latest.json`. The full repository is never
sent to the agent — only relevant structure, satisfying the context-reduction
strategy.

---

## Agents

| Agent | Trigger | Writes code? | Output |
|-------|---------|--------------|--------|
| **Planner** | Issue opened/edited/labeled, `/analyze` | No | `.ai/plans/issue-<n>.md` + comment |
| **Architect** | After Planner | No | Appends `## Architect Review` to the plan |
| **Implementer** | `/implement` | Yes | Feature branch + PR |
| **Reviewer** | PR opened/updated | No | GitHub Review |
| **QA** | After Reviewer | No | `✅ Ready to Merge` / `❌ Needs Work` |

Agents read their behaviour from `.github/prompts/<agent>.md`. Prompts are kept
**separate from workflow logic** so they can be edited without touching YAML.

---

## Slash Commands

Implemented as GitHub Issue Comment events:

| Command | Action |
|---------|--------|
| `/analyze` | (Re)run Planner + Architect |
| `/implement` | Run Implementer, open a PR |
| `/review` | Request a Review pass |
| `/qa` | Request a QA pass |
| `/retry` | Re-run the last failed stage |
| `/update-plan` | Allow human to revise the approved plan before implement |
| `/summarize` | Post a summary comment of the current plan |
| `/regenerate-context` | Rebuild `.ai/context/latest.json` |

> `/retry`, `/review`, `/qa`, `/summarize` and `/regenerate-context` are
> recognised by the dispatcher guard in each workflow; wire them to the matching
> `agent` input in `.github/workflows/*`.

---

## Directory Structure

```text
.github/
├── workflows/      # issue-analysis, implement, review, qa, sync-docs, _ai-dispatch
├── prompts/        # planner, architect, implementer, reviewer, qa
├── scripts/        # TypeScript context-collection + agent runner (tsx)
├── ISSUE_TEMPLATE/ # bug, feature, refactor, tech-debt, docs
├── pull_request_template.md
└── labels.yml

.ai/
├── config.yml      # models, limits, branch naming, label mappings
├── plans/          # issue-<n>.md per planned issue
├── architecture/   # auto-maintained architecture notes
├── memory/         # architectural-decisions, coding-decisions, technical-debt, known-limitations
└── templates/      # plan.md

docs/
└── ai-workflow.md  # this file
```

> No `CLAUDE.md` or `opencode.json` is generated — Laravel Boost already
> provides coding standards and project instructions.

---

## Configuration

Edit `.ai/config.yml` to set:

- `models.*` — model per agent (or `default`).
- `context_limits` — caps on files / tokens / recent commits.
- `branch_naming` — feature branch pattern.
- `commit.style` — enforces Conventional Commits.
- `labels` — map workflow states to your label names.
- `workflow_options` — toggles (architect after planner, qa after review,
  auto-fix, require human approval, prevent redesign, sync docs).
- `agent_runtime` — `opencode` or `claude`.

---

## Labels / State Machine

Labels encode the workflow state machine (`needs-analysis` → `analysis-complete`
→ `approved` → `implementing` → `needs-review` → `qa` → `done`). They are
managed automatically by the workflows; define them via `labels.yml` (the file
is the source of truth and can be synced with a labels action).

---

## Adding a New Agent

1. Create `.github/prompts/<agent>.md` describing its behaviour.
2. Add a `models.<agent>` entry in `.ai/config.yml`.
3. Add a workflow (or extend an existing trigger) that calls
   `_ai-dispatch.yml` with `agent: <agent>`.
4. Add/extend a label in `labels.yml` if the agent changes workflow state.

No changes to the shared dispatcher are required.

---

## Custom Prompts

Prompts are plain Markdown and may reference the injected context blocks:

- `<repository-context>` — compact JSON from `collect-context.ts`.
- `<issue>` — the triggering issue title + body.
- `<pull-request>` — the triggering PR title + body (+ diff when available).
- `<agent-metadata>` — agent name, issue/PR numbers.

Keep prompts instructional and constraint-focused; the agent runtime supplies
the reasoning.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Context empty | Run `/regenerate-context`; ensure `tsx` is installed in CI. |
| Agent step no-ops | The scaffold prints the assembled prompt when no `opencode`/`claude` binary is on PATH. Install the agent CLI in CI. |
| Workflow loops | `concurrency` groups per issue/PR cancel overlapping runs; never auto-trigger on agent-authored commits. |
| Wrong model used | Check `.ai/config.yml` `models.<agent>` and `resolve-model.mjs`. |
| Label missing | Apply labels from `.github/labels.yml`. |

---

## Installation

1. Copy `.github/` and `.ai/` into your repository.
2. Create a repository secret `AI_GITHUB_TOKEN` (a PAT or fine-grained token
   with `contents`, `issues`, `pull-requests` write) — or rely on the default
   `GITHUB_TOKEN`.
3. Ensure the agent runtime (`opencode` or `claude`) is installable in CI. The
   dispatcher will `npm install` it when absent; for production, pin it in a
   setup step.
4. Apply the labels from `.github/labels.yml`.
5. Open an issue (or comment `/analyze`) to start the workflow.

See the **Installation** section of [`README.md`](../README.md) for a step-by-step checklist.

---

## Security Considerations

- The agent pushes branches and opens PRs; scope `AI_GITHUB_TOKEN` minimally.
- Agents never receive secrets; only structural context and issue text.
- Architecture changes require explicit human approval (`/update-plan`).
- `prevent_architecture_redesign` blocks the Implementer from deviating.
- Never store credentials in `.ai/` or `.github/scripts/`; they are not masked
  by default in uploaded artifacts.
