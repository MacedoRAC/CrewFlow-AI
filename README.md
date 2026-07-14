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
  on an explicit `/implement` command.
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
| **Reviewer** | PR opened/updated | No | GitHub Review |
| **QA** | After Reviewer | No | `✅ Ready to Merge` / `❌ Needs Work` |

---

## Slash commands

| Command | Action |
|---------|--------|
| `/analyze` | (Re)run Planner + Architect |
| `/implement` | Run Implementer, open a PR |
| `/review` | Request a Review pass on the linked PR |
| `/qa` | Request a QA pass on the linked PR |
| `/retry` | Re-run the planner for the issue |
| `/update-plan` | Flag the plan for human revision |
| `/summarize` | Post the current plan summary as a comment |
| `/regenerate-context` | Rebuild the compact repository context |

---

## Installation

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

The shared dispatcher (`_ai-dispatch.yml`) looks for `opencode` or `claude` on
`PATH`. In CI it attempts to install `@opencode-ai/cli` when neither is present.
For production, pin it in a setup step inside `_ai-dispatch.yml`:

```yaml
- name: Install agent runtime
  run: npm install -g @opencode-ai/cli
```

Point it at your provider via the `OPENCODE_API_KEY` repo secret if required.

### 3. Provide a token

Create a repository secret `AI_GITHUB_TOKEN` with:

- `contents: write`
- `issues: write`
- `pull-requests: write`

If omitted, the workflows fall back to the built-in `GITHUB_TOKEN`.

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

---

## Configuration

Edit `.ai/config.yml` to set the model per agent, context-size limits, branch
naming, commit style, label mappings, and workflow toggles (e.g. run QA after
review, auto-fix simple failures, require human approval before implement).

Prompts live in `.github/prompts/` and are plain Markdown — edit them without
touching any YAML. See [`docs/ai-workflow.md`](./docs/ai-workflow.md) for the
injected context blocks (`<repository-context>`, `<issue>`, `<pull-request>`,
`<agent-metadata>`).

---

## Security

- The agent pushes branches and opens PRs; scope `AI_GITHUB_TOKEN` minimally.
- Agents receive only structural context and issue text — never secrets.
- Architecture changes require explicit human approval (`/update-plan`).
- `prevent_architecture_redesign` blocks the Implementer from deviating.

---

## License

MIT — free to use, modify, and redistribute.
