# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues in
`Gaoyinxi/xian-receivables`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: use `gh issue list` with appropriate label and state filters.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: use `gh issue edit`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically when
run inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub Issues are the request and triage surface. Pull requests are not included
in the triage queue unless this flag is changed manually later.

GitHub shares one number space across issues and pull requests. If a bare issue
number is ambiguous, try `gh pr view <number>` and then fall back to
`gh issue view <number>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The map is one GitHub issue with child issues as tickets.

- Label the map issue `wayfinder:map`.
- Label children with `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
- Prefer native GitHub sub-issues and issue dependencies.
- If native sub-issues are unavailable, use a task list in the map and add
  `Part of #<map>` to each child.
- If native dependencies are unavailable, add
  `Blocked by: #<number>` to the child issue.
- Claim work with `gh issue edit <number> --add-assignee @me`.
- Resolve work by commenting with the result, closing the child issue, and
  recording the decision or context pointer in the map.
