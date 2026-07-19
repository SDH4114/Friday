---
name: debugging
description: Diagnose failures, regressions, crashes, timeouts, and confusing behavior. Use when the user reports that something is broken or unreliable.
---

# Debugging

Use this skill when the user reports a failure, regression, crash, or confusing behavior.

1. Reproduce the problem or locate direct evidence before changing code.
2. Identify the root cause, not only the visible error message.
3. Make the smallest complete fix that preserves existing behavior.
4. Add a regression test when the failure can be tested reliably.
5. Run the relevant tests, type checks, and a real user-facing smoke test.
6. Report the cause, the fix, and the verification result clearly.

Preserve unrelated user changes. Never hide failures or weaken validation merely to make a test pass.
