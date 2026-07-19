# Skill Quality Checklist

## Required

- Folder and frontmatter `name` match and use lowercase letters, digits, and hyphens.
- `description` says what the skill does and gives concrete trigger situations.
- `SKILL.md` is concise and contains no placeholder text.
- Instructions are actionable and do not pretend the skill grants unavailable tools or permissions.
- References are linked from `SKILL.md` with a clear reason to read them.
- No secrets, personal credentials, generated caches, or unrelated documentation are included.

## Good Description

`Diagnose PostgreSQL query performance using execution plans and index evidence. Use when a user reports slow SQL, high database CPU, or asks for query optimization.`

## Weak Description

`Helps with databases.`

## Scope Rules

- Prefer one coherent workflow over a broad collection of unrelated advice.
- Keep stable reusable instructions in the skill; fetch changing facts when needed.
- Use a product code change for enforcement, new runtime capabilities, or bug fixes.
- Preserve an existing skill unless the user explicitly authorizes its update.
