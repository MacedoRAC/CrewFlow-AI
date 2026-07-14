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
| `/revise <instructions>` | Rewrite the existing plan following your inline instructions |
| `/update-plan` | Allow human to revise the approved plan before implement |
| `/summarize` | Post a summary comment of the current plan |
| `/regenerate-context` | Rebuild `.ai/context/latest.json` |

> `/retry`, `/review`, `/qa`, `/summarize` and `/regenerate-context` are
> recognised by the dispatcher guard in each workflow; wire them to the matching
> `agent` input in `.github/workflows/*`.

---

## Implementation Plan Lifecycle

The plan for each issue lives at **`.ai/plans/issue-<n>.md`** and is
committed to the **default branch** (e.g. `main`) by the analysis agents.
It is *not* stored on a feature branch and *not* kept only as a workflow
artifact — it is a first-class file in the repository.

### Where & when it is committed

| Trigger | What happens | Committed by |
|---------|----------------|----------------|
| `/analyze` | Planner writes the plan; Architect appends a `## Architect Review` verdict | persist step in `_ai-dispatch.yml` |
| `/retry` | Re-runs the Planner; plan is overwritten | persist step |
| `/revise <instructions>` | Rewrites the existing plan in place | persist step (its `if` includes `revise`) |
| `/implement` | **Does not commit the plan.** Branches `issue-<n>-<slug>` from the default branch (which already has the plan) and opens a PR | — (plan already on default) |

The persist step runs only for `planner`, `architect`, and `revise` agents;
the Implementer/Reviewer/QA agents never touch the plan file.

### Why it stays in the repo

- **Provenance** — a permanent issue → plan → PR → merged-code trail.
- **Institutional memory** — future agents read prior plans to avoid
  contradicting past decisions.
- **Feeds the docs sync** — `sync-docs.yml` derives architecture/memory
  docs from these artifacts.
- **Recovery / re-implementation** — the plan is the spec to rebuild from
  via `/revise` + `/implement`.
- **Human reference** — a readable design record that outlives the issue thread.

### How it gets cleaned up

- **On PR merge:** the plan is *not* deleted. The merge only brings the
  feature-branch code into the default branch; the plan is already there, so
  it remains as a permanent record of what shipped.
- **On issue closed *without* a merged PR** (e.g. irrelevant/duplicate):
  `cleanup-plan.yml` deletes `.ai/plans/issue-<n>.md` from the default
  branch — *unless* a merged PR implemented it (`closedByPullRequestsReferences`
  or a merged PR referencing `#<n>`). This prevents stale plans from
  lingering in history.

> Note: analysis commits the plan to the default branch immediately. If you
> close an issue without implementing it, the plan stays on `main` only until
> the close event triggers the cleanup workflow.

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
| Agent step no-ops | In CI the run now **fails loudly** if no `opencode`/`claude` binary is on `PATH`, if the model resolves to `default`, or if the provider key is missing. Check the **Install agent runtime** step and the `OPENCODE_API_KEY` secret. Locally you can set `AI_SCAFFOLD=1` to keep the write-only behaviour. |
| Workflow loops | `concurrency` groups per issue/PR cancel overlapping runs; never auto-trigger on agent-authored commits. |
| Wrong model used | Check `.ai/config.yml` `models.<agent>` and `resolve-model.mjs`. |
| Label missing | Apply labels from `.github/labels.yml`. |

---

## Installation

1. Copy `.github/` and `.ai/` into your repository.
2. Create a repository secret `AI_GITHUB_TOKEN` (a PAT or fine-grained token
   with `contents`, `issues`, `pull-requests` write) — or rely on the default
   `GITHUB_TOKEN`.
3. Choose and configure the **agent runtime** (OpenCode **or** Claude Code).
   See [Agent runtime setup](#agent-runtime-setup) below.
4. Apply the labels from `.github/labels.yml`.
5. Open an issue (or comment `/analyze`) to start the workflow.

See the **Installation** section of [`README.md`](../README.md) for a step-by-step checklist.

---

### Agent runtime setup

The framework supports two headless runtimes. Pick one and set it in
`.ai/config.yml` under `agent_runtime`:

```yaml
agent_runtime: opencode   # or: claude
```

The shared dispatcher (`_ai-dispatch.yml`) reads `agent_runtime` and installs
the matching CLI automatically when it is not already on `PATH`. For production,
pin the install in a setup step.

#### Option A — OpenCode

- Install locally (optional): `curl -fsSL https://opencode.ai/install | sh`
- CI: the dispatcher installs it automatically via the official installer when
  missing, then adds it to `PATH`.
- Auth: set `provider:` in `.ai/config.yml` (e.g. `anthropic`) and put that
  provider's API key in the repo secret `OPENCODE_API_KEY`. The dispatcher maps
  it to the correct provider env var automatically.
- Invocation (handled for you): `opencode run --model <provider/model> --print-logs --auto "<prompt>"`

#### Option B — Claude Code

- Install locally (optional): `npm install -g @anthropic-ai/claude-code`
- CI: the dispatcher installs it via npm when missing and adds `node_modules/.bin`
  to `PATH`.
- Authenticate in CI by putting your Anthropic key in the `OPENCODE_API_KEY`
  repo secret — the dispatcher forces `provider: anthropic` and maps it to
  `ANTHROPIC_API_KEY` automatically. The agent runs with `--print` and
  `--dangerously-skip-permissions` to apply changes without prompts.
- Invocation (handled for you): `claude --print --model <bare-anthropic-id> --dangerously-skip-permissions "<prompt>"`

> Both runtimes receive the **same** prompt templates and context; only the
> binary and auth secret differ. Switching runtimes is a one-line config change.


---

## Security Considerations

- The agent pushes branches and opens PRs; scope `AI_GITHUB_TOKEN` minimally.
- Agents never receive secrets; only structural context and issue text.
- Architecture changes require explicit human approval (`/update-plan`).
- `prevent_architecture_redesign` blocks the Implementer from deviating.
- Never store credentials in `.ai/` or `.github/scripts/`; they are not masked
  by default in uploaded artifacts.
