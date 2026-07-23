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
5. Keep secrets out of logs, config, skills, remote snapshots, and test fixtures. Local Raya backups may contain credentials by explicit design and must retain owner-only storage.
6. Preserve old config and package behavior unless a migration is deliberate and tested.
7. Avoid retry loops and repeated status output; aggregate recurring failures and retry with bounded backoff where appropriate.
8. For TUI input, test raw bytes and parsed keypress events; terminal Escape and control chords can arrive through both paths.
9. For repaintable TUI frames, count physical terminal rows after soft wrapping and explicit newlines. Never clear a fixed number of logical lines when content may exceed terminal width.
10. For MCP, test config normalization, connection failure cleanup, tool safety, stdio end to end, and every supported HTTP-family transport when the environment permits sockets.
11. For updater work, prove that checkpoint failure prevents installation, metadata and checkout use one commit, and the installer cannot access the user's real `RAYA_HOME`.
12. For platform work, validate Windows-native executable names and PATH rules in unit tests, keep `install.ps1` and `install.sh` behavior aligned, and retain the Windows GitHub Actions job.

## Verify

Run the smallest relevant test during development. Before handoff, normally run:

```bash
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

The `Validate Raya` workflow repeats typecheck, tests, build, and package inspection on Windows, macOS, and Linux. A local macOS/Linux run proves shared behavior but does not replace a green `windows-latest` job for native PowerShell and `.cmd` execution.

Also run a user-facing command with an isolated `RAYA_HOME` when the behavior touches setup, config, skills, sessions, MCP, or the terminal interface. Use `git diff --check` and inspect the final diff.

For a source checkout, smoke `node dist/cli/index.js --help`, `status`, relevant `config` mutations, and `mcp test` against a deterministic fixture. Do not use the globally installed `raya` as proof of an uninstalled source change.

## Improve Through Skills

Prefer a skill when the improvement is reusable guidance or a repeatable workflow. Change executable source when new runtime capability, safety enforcement, performance, or interface behavior is required. Do not use a skill to conceal a product defect.
