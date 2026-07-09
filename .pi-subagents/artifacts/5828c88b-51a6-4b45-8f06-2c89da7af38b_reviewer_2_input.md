# Task for reviewer

[Read from: /Users/aminmammadov/giti/Friday/plan.md, /Users/aminmammadov/giti/Friday/progress.md]

Сделай read-only обзор всего репозитория /Users/aminmammadov/giti/Friday как codebase health audit. Ничего не изменяй. Ищи только фактические проблемы/дырки/непонятности текущей реализации, с file/line references где возможно. Не предлагай большой roadmap Raya; будущий оркестратор пока не анализировать.

---
Update progress at: /Users/aminmammadov/giti/Friday/.pi-subagents/artifacts/progress/5828c88b-51a6-4b45-8f06-2c89da7af38b/progress.md

---
**Output:**
Write your findings to exactly this path: /Users/aminmammadov/giti/Friday/.pi-subagents/artifacts/outputs/5828c88b-51a6-4b45-8f06-2c89da7af38b/repo-read/health-audit.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```