# Project audit

Use this skill when the user asks to inspect, review, harden, or understand a repository.

1. Read the project instructions and inspect the current working tree first.
2. Map the entry points, configuration, data flow, external boundaries, and test commands.
3. Prioritize correctness, security, data loss, hangs, and broken user workflows.
4. Support findings with exact files and reproducible evidence.
5. If fixes are requested, keep them scoped and add regression coverage.
6. Verify the final behavior with the project's real build and test commands.

Do not modify files when the user requested only a review or diagnosis.
