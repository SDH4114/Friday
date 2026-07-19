# Implementation

Use this skill for feature work and code changes.

1. Understand the existing architecture and conventions before editing.
2. Define the complete user workflow, including configuration, errors, cleanup, and documentation.
3. Prefer additive, backward-compatible changes and preserve unrelated work.
4. Keep public names and messages consistent across CLI, config, docs, and tests.
5. Validate inputs at boundaries and avoid storing secrets in ordinary config files.
6. Run focused tests while developing, then typecheck, full tests, build, and a practical smoke test.

Finish working behavior rather than leaving core paths as placeholders.
