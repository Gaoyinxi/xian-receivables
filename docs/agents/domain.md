# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- Read `CONTEXT.md` at the repository root when it exists.
- Read ADRs under `docs/adr/` that affect the area being changed.

If a referenced file does not exist, proceed silently. Do not require a domain
document before ordinary work. The domain-modeling workflow creates or extends
it when terminology or architectural decisions are actually resolved.

## File structure

This repository uses a single-context layout:

```text
/
├── CONTEXT.md                 # optional, created when terms are resolved
├── docs/
│   └── adr/                   # system-wide architectural decisions
├── apps/
│   ├── web/
│   ├── api/
│   └── web-server/
└── lib/
```

The web application, API, gateway, database, and supporting libraries belong to
one project-receivables business context.

## Use the glossary's vocabulary

When `CONTEXT.md` defines a domain concept, use that exact term in issue titles,
refactoring proposals, hypotheses, tests, APIs, and documentation.

Do not drift to synonyms that the glossary explicitly avoids. If a necessary
concept is missing, reconsider whether the term is needed or record the gap for
domain modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, state the conflict explicitly
rather than silently overriding the decision.
