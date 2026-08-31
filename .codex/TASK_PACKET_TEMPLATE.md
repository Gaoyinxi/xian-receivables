# Sol Task Packet

Use this template only after a hard escalation trigger in `AGENTS.md` is met.
The completed packet must be 1–3K tokens and must be the entire prompt sent to
Sol. Start the Sol agent with no inherited turns.

## 1. Goal

State the concrete outcome in one or two sentences.

## 2. Escalation trigger

Name the exact `MUST escalate` rule that was met and the evidence for it.

## 3. Decision boundary

- Sol must decide:
- Sol must not decide:

## 4. Current behavior and relevant path

Summarize the observed behavior and the smallest useful execution/data flow.

## 5. Key code

Include only decision-relevant symbols, interfaces, schemas, or short excerpts.
For every excerpt, include its file path and line or symbol. Never paste whole
files, generated files, repository listings, or unrelated implementation.

## 6. Facts and assumptions

### Established facts

-

### Assumptions to challenge

-

## 7. Evidence and attempts

Summarize focused commands, tests, the decisive error lines, and attempted
hypotheses. Do not paste complete logs. For a difficult bug, describe the two
evidence-backed attempts and why each failed.

## 8. Constraints and invariants

List compatibility, security, permissions, data integrity, public API, Sites,
D1/R2, performance, and explicitly out-of-scope constraints that affect the
decision.

## 9. Open questions

Ask only the questions Sol must resolve to unblock implementation.

## 10. Required output

Return these headings:

1. Verdict
2. Key assumptions
3. Recommended approach
4. Alternatives and tradeoffs
5. Ordered implementation steps
6. Validation and rollback
7. Risks and confidence

If information is insufficient, list at most three precise missing facts. Do
not inspect the repository or request the full context.

## 11. Redaction check

- [ ] 1–3K tokens total
- [ ] No secrets, credentials, personal data, or private production values
- [ ] No full conversation, whole file, complete log, or repository dump
- [ ] Facts are separated from assumptions
- [ ] Constraints, evidence, and the exact decision question remain intact

If over budget, remove background narrative and redundant excerpts first.
Never remove material constraints, contradictory evidence, or the decision
question merely to meet the budget.
