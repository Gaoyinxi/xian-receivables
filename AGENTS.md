# Codex dual-model workflow

This repository uses Luna for execution and Sol for exceptional deep reasoning.
These rules apply to future tasks opened from this trusted project. They do not
claim that an already-running session changed models mid-turn.

## Default route: Luna executes

Unless a hard escalation trigger below is met, use `gpt-5.6-luna` to inspect
the codebase, search focused sources, run commands, modify code, and test the
result. Do not invoke Sol merely because a task is long or contains many files.

The coordinating Luna agent owns the full execution loop:

1. Inspect the real code and collect focused evidence.
2. Make the smallest defensible change.
3. Run verification proportional to risk.
4. Report the route used and the evidence that the result works.

Use the `luna_executor` custom agent only for a bounded execution subtask when
delegation is useful. The main Luna agent may execute directly and should not
spawn another Luna agent for routine sequential work.

## MUST escalate to Sol

Escalate before making a consequential decision when any one condition holds:

- A decision crosses two or more modules, a public API, a data model, or a
  system boundary and cannot be localized safely.
- The decision materially affects authorization, security, concurrency, data
  migration, risk of data loss, or production availability.
- Multiple plausible approaches create meaningfully different long-term
  compatibility or maintenance costs.
- Two evidence-backed diagnosis or repair attempts have failed and the root
  cause is still unexplained or the same failure keeps returning.
- Requirements or evidence conflict and further routine inspection cannot
  resolve the decision.

Uncertainty alone is not enough. It must also involve high consequences,
cross-boundary tradeoffs, conflicting evidence, or repeated failed attempts.

## MUST NOT escalate to Sol

Do not invoke Sol for:

- File discovery, routine code reading, ordinary commands, formatting,
  dependency inspection, or running tests.
- A clear single-file or local change with a known validation path.
- A bug with a demonstrated root cause and a deterministic fix.
- Rechecking a conclusion Luna can already prove with focused tests.
- Work that is large in volume but contains no difficult decision.

## Sol handoff protocol

For each independent decision, invoke Sol at most once. Do not run multiple Sol
agents as a vote on the same question. The coordinating agent owns escalation;
an execution subagent must return evidence instead of recursively delegating.

Before invoking Sol, complete `.codex/TASK_PACKET_TEMPLATE.md`. The packet must
be redacted and 1–3K tokens. It must include the exact goal, trigger, decision
boundary, only the key code, core constraints, evidence, attempted approaches,
and open questions.

The Sol invocation MUST use all of these settings:

- custom role: `sol_reasoner` when the client exposes role selection;
- `fork_turns="none"`;
- `model="gpt-5.6-sol"`;
- `reasoning_effort="xhigh"`;
- prompt content: only the completed, redacted Task Packet.

If custom-role selection is unavailable, use the explicit model and effort
values above and include the same Sol behavior/output contract in the packet.
Do not assume the agent TOML can set `fork_turns`; that is a spawn-time option.

Sol is advisory and read-only. It does not modify the repository and its answer
is not verification. After Sol responds, Luna must check the recommendation
against the real code, make the changes, run the relevant tests, and retain a
safe rollback path for high-risk work.

## Final report

Every completed task must say either:

- `Route: Luna direct` and name the focused verification; or
- `Route: Luna -> Sol -> Luna`, state the one-line escalation trigger, and name
  Luna's implementation and verification.

An explicit user choice of model, request not to delegate, or stricter runtime
policy overrides these repository defaults.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for
`Gaoyinxi/xian-receivables`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default canonical triage labels. See
`docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout with an optional root `CONTEXT.md` and system-wide
ADRs under `docs/adr/`. See `docs/agents/domain.md`.
