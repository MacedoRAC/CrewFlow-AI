# CrewFlow AI

> An autonomous, AI-driven engineering crew powered by OpenCode / Claude Code, orchestrated entirely from GitHub.

Turn GitHub Issues, Pull Requests and comments into an orchestration layer for an
AI agent that plans, implements, reviews and QA's your code — with humans
approving every meaningful step.

- **Works with any repository.** Ships tuned for Laravel + Vue + TypeScript but
  the discovery scripts and prompts are framework-agnostic.
- **No Anthropic API integration required.** OpenCode (or Claude Code) is the
  reasoning engine; GitHub Actions is the orchestrator.
- **Minimal configuration.** Drop the files in, set one token, open an issue.
- **Humans stay in control.** Plans are reviewed, and implementation only starts
  on an explicit `/implement` command. Merging is never automated — agents are
  forbidden from running `gh pr merge` / auto-merge, and a human performs every
  merge (enforce this with branch protection requiring a human approval).
- **Token-efficient.** The agent only ever receives a compact, issue-specific
  view of your repository — never the whole tree.

---

## How it works

```text
Issue Created
      │
      ▼
/analyze  →  Planner  →  Architect      (plan saved to .ai/plans/issue-<n>.md)
      │
      ▼
Human review  →  /implement
      │
      ▼
Implementer  →  feature branch + Pull Request
      │
      ▼
Reviewer (automatic GitHub Review)
      │
      ▼
QA  →  ✅ Ready to Merge / ❌ Needs Work
      │
      ▼
Merge  →  sync-docs updates .ai/ architecture & memory
```

Every stage is **restartable and idempotent**.

---

## Agents

| Agent | Trigger | Writes code? | Output |
|-------|---------|--------------|--------|
| **Planner** | Issue opened/edited, `/analyze` | No | `.ai/plans/issue-<n>.md` + comment |
| **Architect** | After Planner | No | Appends review to the plan |
| **Implementer** | `/implement` | Yes | Feature branch + PR |
| **Reviewer** | PR opened/updated (or `/review` on demand) | No | GitHub Review |
| **QA** | After Reviewer (or `/qa` on demand) | No | `✅ Ready to Merge` / `❌ Needs Work` |

> The Reviewer and QA normally run automatically when a PR is opened or updated.
> The `/review` and `/qa` slash commands let you request an additional pass on a
> linked PR at any time.

---

## How plans are stored

Each issue's plan is committed to the **default branch** at
`.ai/plans/issue-<n>.md` by the analysis agents (`/analyze`, `/retry`,
`/revise`) — not on a feature branch. `/implement` does **not** commit
the plan; it branches from the default branch, which already has it.

- **Why it stays:** it is the issue → plan → PR → merged-code trail, gives
  future agents prior-decision context, and feeds the architecture/memory sync.
- **Cleanup:** on a merged PR the plan remains as a permanent record. If an
  issue is **closed without a merged PR**, `cleanup-plan.yml` deletes its
  plan from the default branch so stale plans don't linger.

## Slash commands

| Command | Action |
|---------|--------|
| `/analyze` | (Re)run Planner + Architect |
| `/implement` | Run Implementer, open a PR |
| `/review` | Request a Review pass on the linked PR |
| `/qa` | Request a QA pass on the linked PR |
| `/retry` | Re-run the planner for the issue |
| `/revise <instructions>` | Rewrite the existing plan using your inline instructions |
| `/update-plan` | Flag the current plan for human revision |
| `/summarize` | Post the current plan summary as a comment |
| `/regenerate-context` | Rebuild the compact repository context |

---

## Installation

> 💡 **Too lazy to do it by hand?** Ask your vibe coding tool to set it up for
> you. Open it in **plan mode** and prompt:
>
> ```text
> Add https://github.com/MacedoRAC/CrewFlow-AI to this project
> ```
>
> The coding agent will analyze your repository and ask you which option you want
> to go for before making any changes.

### 0. Prerequisites

- **Git** and a GitHub repository you can push to.
- **Node.js ≥ 20** — the workflows run on `ubuntu-latest` with Node 20, and the
  local dry-run (step 7) uses the same runtime.
- **[tsx](https://github.com/privatenumber/tsx)** — only needed for the optional
  local dry-run:

  ```bash
  npm install -g tsx
  ```

The discovery scripts under `.github/scripts/` run through `tsx`. In CI this is
installed automatically by the workflow; on your machine it is only required for
the dry-run in step 7.

### 1. Copy the framework

Copy these directories and files into your repository root:

```text
.github/workflows/
.github/prompts/
.github/scripts/
.github/ISSUE_TEMPLATE/
.github/pull_request_template.md
.github/labels.yml
.ai/config.yml
.ai/plans/
.ai/architecture/
.ai/memory/
.ai/templates/
docs/ai-workflow.md
```

### 2. Configure the agent runtime

Pick **OpenCode** or **Claude Code** as the reasoning engine and set it in
`.ai/config.yml`:

```yaml
agent_runtime: opencode   # or: claude
```

The shared dispatcher (`_ai-dispatch.yml`) reads `agent_runtime` and installs
the matching CLI automatically when it is not already on `PATH`.

**OpenCode**
- Install: CI installs it automatically via the official installer
  (`curl -fsSL https://opencode.ai/install | sh`); no local step needed.
- Auth: repo secret `OPENCODE_API_KEY` = your **provider** API key (e.g.
  Anthropic). The dispatcher maps it to the right env var per `provider:` in
  `.ai/config.yml`.
- Invoked as: `opencode run --model <provider/model> --print-logs --auto "<prompt>"`.

**Claude Code**
- Install: `npm install -g @anthropic-ai/claude-code` (or let CI install it).
- Auth: put your Anthropic key in the `OPENCODE_API_KEY` secret — the
  dispatcher forces `provider: anthropic` and maps it to `ANTHROPIC_API_KEY`
  automatically (no separate secret needed).
- Invoked as: `claude --print --model <bare-anthropic-id> --dangerously-skip-permissions "<prompt>"`.

Both runtimes use the same prompts and context — only the binary and auth
secret differ, so switching is a one-line config change.

### 3. Provide the required secrets

The workflows need a few repository secrets. See the dedicated
[**Secrets**](#secrets) section below for a full walkthrough of how to create
each one and where to paste it. In short you will add:

- **`AI_GITHUB_TOKEN`** (required) — a GitHub PAT that lets the bot push
  branches, open PRs and comment on issues. If omitted, the workflows fall back
  to the built-in `GITHUB_TOKEN` (with reduced privileges).
- **`OPENCODE_API_KEY`** (for the `opencode` runtime with a hosted provider —
  your provider's API key, e.g. Anthropic). Mapped automatically to the correct
  provider env var. For the `claude` runtime, this same secret holds your
  Anthropic key (mapped to `ANTHROPIC_API_KEY`).

### 4. Apply labels

The workflows expect the state-machine labels. Create them from
`.github/labels.yml` (use a labels-sync action or `gh label create`). They are:

```text
needs-analysis  analysis-complete  approved  implementing
needs-review    qa                 blocked   waiting-for-user  done
```

### 5. Tune configuration

Edit `.ai/config.yml`:

- Set `models.*` to your preferred model per agent.
- Adjust `context_limits` and `branch_naming`.
- Toggle `workflow_options` (e.g. disable `qa` or auto-fix).

See the [**Configuration**](#configuration) section below for a full example.

### 6. Verify

1. Open a new issue (any template) → it is labelled `needs-analysis`.
2. Comment `/analyze` → Planner + Architect run, plan saved to
   `.ai/plans/issue-<n>.md`, comment posted, label `analysis-complete`.
3. Comment `/implement` → branch created, code implemented, PR opened, label
   `implementing` → `needs-review`.
4. Reviewer posts a GitHub Review; QA posts `✅ Ready to Merge` / `❌ Needs Work`.
5. Merge → `sync-docs.yml` updates `.ai/architecture/` and `.ai/memory/`.

### 7. (Optional) Local dry-run

To inspect the context the agents receive without CI:

```bash
npm install -g tsx
AI_ISSUE_NUMBER=1 npx tsx .github/scripts/collect-context.ts
cat .ai/context/latest.json
```

---

## Secrets

All secrets are added per-repository at
**Settings → Secrets and variables → Actions → New repository secret**.
Use a *repository* secret (not an environment secret) so every workflow can read
it. The reusable dispatcher (`_ai-dispatch.yml`) declares two secrets:
`AI_GITHUB_TOKEN` (required) and `OPENCODE_API_KEY` (the provider API key — for
the `claude` runtime it is mapped to `ANTHROPIC_API_KEY` automatically, so a
separate `ANTHROPIC_API_KEY` secret is not needed).

### `AI_GITHUB_TOKEN` *(required)*

A GitHub Personal Access Token (PAT) that the bot uses to push branches, open
pull requests, label issues and post comments. Scope it to the minimum needed:

- `contents: write` — push feature branches and commit plans/architecture
- `issues: write` — label issues and post analysis comments
- `pull-requests: write` — open PRs and post reviews

**How to create it:**

1. Go to **GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic)** (or use a fine-grained token).
2. Click **Generate new token**.
3. Give it a name like `crewflow-bot`, set an expiry, and tick the three scopes
   above (classic: `repo` also works but is broader; fine-grained: grant
   *Contents*, *Issues*, and *Pull requests* read & write for this repo only).
4. Click **Generate token** and **copy the value immediately** — it is shown
   only once.
5. In your target repo go to **Settings → Secrets and variables → Actions**,
   click **New repository secret**, name it `AI_GITHUB_TOKEN`, paste the token,
   and save.

> If you skip this secret, the workflows automatically fall back to the built-in
> `GITHUB_TOKEN`. That token can read/write the current repo but cannot trigger
> other workflows or cross private boundaries, so using a dedicated PAT is
> recommended for full functionality (e.g. bot-authored commits appearing in
> checks).

### `OPENCODE_API_KEY` *(required for `opencode` runtime with a hosted provider)*

This is the **provider API key** OpenCode uses to call the model — not an
OpenCode-specific login. The dispatcher automatically maps this single secret to
the correct provider environment variable (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, …) based on the
`provider:` value in `.ai/config.yml`, so you only ever manage **one** secret
regardless of provider.

- **Anthropic (default):** an Anthropic API key. Put it in `OPENCODE_API_KEY`.
- **OpenAI / Google / Groq / OpenRouter / …:** the matching provider key.
- **OpenCode Zen (hosted, pay-as-you-go):** the Zen API key.
- **OpenCode Go (flat-rate, open coding models):** the Go API key.
- **Local models (Ollama, LM Studio) or a key-less provider:** leave it empty.

**To create it:** make a repository secret named exactly `OPENCODE_API_KEY`
with your provider's API key. If it is missing, the agent run fails with a clear
auth error (it is no longer silently skipped).

> **Plug-and-play note:** you do **not** need to edit `opencode.json` or forward
> extra secrets. Set `provider:` in `.ai/config.yml` (e.g. `anthropic`,
> `openai`, `google`) and put that provider's key in `OPENCODE_API_KEY`; the
> dispatcher wires the rest.

#### Using OpenCode Go (or Zen)

OpenCode's own hosted providers are first-class — set `provider:` to
`opencode-go` (or `opencode` / `zen` for Zen) and put the Go/Zen API key in the
same `OPENCODE_API_KEY` secret. The dispatcher exports `OPENCODE_API_KEY`,
`OPENCODE_GO_API_KEY` and `OPENCODE_ZEN_API_KEY` from that one secret, so it
works whichever env var OpenCode reads.

Because model ids are `provider/model`, you must also switch the `models:`
block to the OpenCode-hosted catalog, e.g.:

```yaml
agent_runtime: opencode
provider: opencode-go
models:
  planner:    opencode-go/qwen3-coder-480b
  architect:  opencode-go/qwen3-coder-480b
  implementer: opencode-go/qwen3-coder-480b
  reviewer:   opencode-go/qwen3-coder-480b
  qa:         opencode-go/qwen3-coder-480b
```

Run `opencode models opencode-go` (or `opencode models`) locally to list the
exact model ids available on your plan, then paste them in. Leaving a model as
`default` falls back to `opencode-go/claude-sonnet-4-20250514`, which may not be
in the Go catalog — prefer explicit ids.

### `ANTHROPIC_API_KEY` *(used by the `claude` runtime)*

Claude Code is Anthropic-only. The dispatcher forces `provider: anthropic`
when `agent_runtime: claude` and **reuses the `OPENCODE_API_KEY` secret**,
mapping its value to `ANTHROPIC_API_KEY` automatically — so you do **not** need
a separate secret.

- Put your Anthropic API key in the **`OPENCODE_API_KEY`** repository secret
  (the same one used by the opencode runtime).
- Get it from **console.anthropic.com → API Keys → Create Key**.

> If you prefer a dedicated secret, add `ANTHROPIC_API_KEY` and forward it
> alongside `OPENCODE_API_KEY` in the `secrets:` block of `_ai-dispatch.yml`
> and the calling workflows.

### Quick checklist

| Secret | Runtime | Required? | Where to get it |
|--------|---------|-----------|-----------------|
| `AI_GITHUB_TOKEN` | both | **Yes** (recommended) | GitHub → Developer settings → PAT (`contents`, `issues`, `pull-requests`) |
| `OPENCODE_API_KEY` | both | **Yes** for hosted providers — mapped to the right provider env var (incl. `ANTHROPIC_API_KEY` for the claude runtime) | your model provider's dashboard |

> Tip: after adding secrets, open a new issue and run `/analyze`. If the
> runtime, model, or key is misconfigured, the workflow now **fails loudly** with
> a clear message in the **Actions** tab instead of silently reporting success.

---

## Repository layout

```text
.github/
├── workflows/      # issue-analysis, implement, review, qa, sync-docs, commands, _ai-dispatch
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
└── ai-workflow.md  # full documentation
```

> `.github/scripts/` also contains supporting utilities that are not discovery
> scripts: `run-agent.mjs` (agent runner), `resolve-model.mjs` (model
> resolution), `repo.mts` (shared git/repo helpers) and `update-memory.mts`
> (post-merge memory sync). You normally won't edit these.

---

## Configuration

Edit `.ai/config.yml` to set the model per agent, context-size limits, branch
naming, commit style, label mappings, and workflow toggles (e.g. run QA after
review, auto-fix simple failures, require human approval before implement).

A minimal, annotated example:

```yaml
# Model assignment per agent. Use "default" to let the runtime choose.
models:
  planner: default
  architect: default
  implementer: default
  reviewer: default
  qa: default

# Hard ceiling on the repository context sent to agents.
context_limits:
  max_files: 80
  max_context_tokens: 12000
  include_recent_commits: 10

# Feature branch naming. {number} and {slug} are substituted at runtime.
branch_naming:
  strategy: "issue-{number}-{slug}"
  max_slug_words: 3

# Conventional Commits prefix enforced on implementer commits.
commit:
  style: conventional
  allow_types: [feat, fix, refactor, perf, docs, test, chore, style]

# Labels representing the workflow state machine.
labels:
  needs_analysis: needs-analysis
  analysis_complete: analysis-complete
  approved: approved
  implementing: implementing
  needs_review: needs-review
  qa: qa
  blocked: blocked
  waiting_for_user: waiting-for-user
  done: done

# Per-agent workflow toggles.
workflow_options:
  run_architect_after_planner: true
  run_qa_after_review: true
  auto_fix_simple_failures: true
  require_human_approval_before_implement: true
  prevent_architecture_redesign: true
  sync_docs_on_merge: true

# Agent runtime. "opencode" or "claude".
agent_runtime: opencode
```

Prompts live in `.github/prompts/` and are plain Markdown — edit them without
touching any YAML. See [`docs/ai-workflow.md`](./docs/ai-workflow.md) for the
injected context blocks (`<repository-context>`, `<issue>`, `<pull-request>`,
`<agent-metadata>`).

---

## How the repository context is built

A common point of confusion: the compact view of your repository that agents
receive is **generated automatically, but not by AI.** It is produced by a set
of deterministic, framework-agnostic discovery scripts and is purely structural.

When a workflow needs context, it runs `collect-context.ts`, which shells out to
each of these scripts via `tsx` and merges their JSON output into a single
`.ai/context/latest.json` (collect-context.ts:14-24):

| Script | What it extracts |
|--------|------------------|
| `build-tree.mts` | Repository file/folder tree |
| `discover-files.mts` | Important/changed files (issue- or PR-scoped) |
| `discover-models.mts` | Data models / entities |
| `discover-services.mts` | Service / class definitions |
| `discover-routes.mts` | Route / endpoint definitions |
| `discover-tests.mts` | Test files and coverage signals |
| `dependency-map.mts` | Import relationships between files |
| `classify-issue.mts` | Issue type and affected areas |
| `generate-summary.mts` | Human-readable summary of the above |

Each script runs in its own process, so a single failure can never break the
whole build (collect-context.ts:26-37). Recent git history for the most
relevant files is appended (`recentHistory`), then the merged result is written
to `.ai/context/latest.json` and injected into agent prompts as the
`<repository-context>` block.

Key takeaways:

- **No LLM is involved in building the context.** It is fast, cheap, and fully
  reproducible — the same repo always yields the same context.
- **AI is only the reasoning engine.** OpenCode / Claude consumes this compact
  context to plan, implement, review, and QA. It never generates the context.
- **You control freshness.** Context is rebuilt on each run, and you can force a
  refresh at any time with the `/regenerate-context` slash command.

---

## Security

- The agent pushes branches and opens PRs; scope `AI_GITHUB_TOKEN` minimally.
- Agents receive only structural context and issue text — never secrets.
- Implementation never starts automatically: the Implementer runs only after a
  human comments `/implement`, and `prevent_architecture_redesign` blocks it
  from deviating from the approved plan.
- If a plan needs changes, comment `/update-plan` to flag it for human revision
  before re-running `/analyze` or `/implement`.

---

## License

MIT — free to use, modify, and redistribute.
