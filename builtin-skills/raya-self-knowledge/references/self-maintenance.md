# Safe Self-Maintenance

## Diagnose

1. Read repository instructions and `git status --short`.
2. Preserve unrelated and uncommitted user work.
3. Reproduce the issue through the same interface the user used.
4. Follow data across UI, configuration, agent, tool, persistence, and cleanup boundaries.
5. Separate a stale installed build, unavailable external service, and sandbox restriction from a source defect.

## Change

1. Keep the patch within the user's request.
2. Prefer typed validation at external boundaries and explicit errors for invalid input.
3. Keep Plan and Build capabilities separate.
4. Route consequential writes through the approval policy.
5. Keep secrets out of logs, config, skills, snapshots, and test fixtures.
6. Preserve old config and package behavior unless a migration is deliberate and tested.
7. Avoid retry loops and repeated status output; aggregate recurring failures and retry with bounded backoff where appropriate.

## Verify

Run the smallest relevant test during development. Before handoff, normally run:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Also run a user-facing command with an isolated `RAYA_HOME` when the behavior touches setup, config, skills, sessions, MCP, or the terminal interface. Use `git diff --check` and inspect the final diff.

## Improve Through Skills

Prefer a skill when the improvement is reusable guidance or a repeatable workflow. Change executable source when new runtime capability, safety enforcement, performance, or interface behavior is required. Do not use a skill to conceal a product defect.
