---
name: implementation
description: Implement complete product features and code changes. Use when the user asks to add, change, integrate, or finish working behavior.
---

# Implementation

Use this skill for feature work and code changes.

1. Understand the existing architecture and conventions before editing.
2. Define the complete user workflow, including configuration, errors, cleanup, and documentation.
3. Prefer additive, backward-compatible changes and preserve unrelated work.
4. Keep public names and messages consistent across CLI, config, docs, and tests.
5. Validate inputs at boundaries and avoid storing secrets in ordinary config files.
6. Run focused tests while developing, then typecheck, full tests, build, and a practical smoke test.

For a new direct CLI shortcut, decide whether it belongs in Raya itself or in the user's command registry. Stable product behavior belongs in `src/cli/index.ts`; a personal executable shortcut belongs in `~/.raya/commands.json` and should be created with `raya commands add`. Do not model executable commands as instruction-only skills.

Finish working behavior rather than leaving core paths as placeholders.
