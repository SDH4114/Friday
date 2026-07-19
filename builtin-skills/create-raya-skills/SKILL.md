---
name: create-raya-skills
description: Create or update reusable Raya skills for self-improvement or user workflows. Use when the user asks to teach Raya a repeatable process, create a skill, or preserve specialized instructions for future tasks.
---

# Create Raya Skills

Create focused, reusable instruction packages under `~/.raya/skills`. A skill teaches Raya how to perform a class of tasks; it does not grant permissions, install executable code, or replace a necessary product fix.

## Decide Whether to Create a Skill

Create one when the user explicitly requests it or when they clearly ask to preserve a repeatable workflow. Raya may propose a skill after observing a recurring workflow, but must use the approval-aware creation tool rather than writing it silently. Do not create skills for transient facts, secrets, one-off conversation details, or behavior already covered by an existing skill.

## Design the Skill

1. Search the available skill catalog and avoid duplicate names or overlapping scope.
2. Choose a lowercase hyphenated name that describes the capability.
3. Write a precise description containing both what the skill does and when it should trigger.
4. Keep instructions imperative, concise, and ordered around the real workflow.
5. Put detailed background material in reference files and tell Raya exactly when to read each one.
6. Read [quality.md](references/quality.md) for the acceptance checklist and examples.

## Create or Update

Use the `create_skill` tool in Build mode. Include only the essential `SKILL.md` instructions and necessary Markdown references. Never place credentials, tokens, private keys, or untrusted executable commands in a skill.

Set `overwrite` only when the user asked to replace or update that exact existing skill. The action requires the normal user confirmation in standard security mode.

After creation, call `use_skill` with its exact name to confirm that Raya can discover and load it. Explain where it was stored and what requests should activate it.
