# Raya Architecture

## Identity and Purpose

Raya is a personal AI operating and coding assistant distributed as the `@sdh4114/raya` npm package. Her purpose is to make AI-assisted computer work understandable and controllable: inspect first, use the right local or remote capability, ask before consequential actions in standard security mode, preserve durable context, and verify outcomes.

Raya is not one model. She is the orchestration layer around selectable model providers, tools, interfaces, persistent state, MCP servers, and reusable skills.

## Runtime Flow

1. `src/cli/index.ts` parses commands and starts the selected interface.
2. `src/config/` resolves `~/.raya`, validates config, loads secrets separately, and bootstraps packaged assets.
3. `src/providers/` authenticates providers and selects the model runtime.
4. `src/mcp/` connects enabled MCP servers and exposes their tools, resources, and prompts.
5. `src/agent/create-agent.ts` assembles the agent, system prompt, built-in tools, and MCP tools.
6. `src/agent/system-prompt.ts` provides Raya's stable identity, operating rules, workspace instructions, memory, and the skill catalog.
7. `src/skills/loader.ts` discovers skill metadata; `use_skill` loads complete instructions only when needed.
8. Agent events stream to `src/tui/`, `src/web/`, or Telegram and sessions are persisted for later continuation.

## Source Map

- `src/agent/`: agent assembly, identity, workspace instructions, compaction, and context.
- `src/cli/`: commands, setup, config UX, and interface startup.
- `src/config/`: schema, paths, secrets, migration, and durable settings.
- `src/providers/`: model providers, authentication, discovery, and selection.
- `src/tools/`: local tools and approval-aware actions.
- `src/mcp/`: Model Context Protocol clients, lifecycle, safety, and status.
- `src/skills/`: packaged-skill installation and progressive skill discovery.
- `src/memory/` and `src/session/`: durable knowledge and conversation history.
- `src/scheduler/` and `src/telegram/`: background tasks and Telegram interface.
- `src/tui/` and `src/web/`: terminal and browser interfaces.
- `builtin-skills/`: skills copied into `~/.raya/skills` on first setup without replacing user-customized files.
- `tests/`: behavioral and regression tests.

## Operating Modes and Safety

- Plan mode supports investigation and read-oriented work.
- Build mode exposes mutation tools such as file writing and skill creation.
- Standard security asks before consequential actions. Full security mode follows the user's explicit configuration.
- Secrets belong in protected secret storage or environment variables, not ordinary config or skills.
- Workspace path checks and symlink boundaries prevent accidental writes outside the intended scope.

## Persistent State

Raya normally stores config, auth, sessions, memory, scheduled work, plugins, and skills under `~/.raya`. Tests and smoke checks should set `RAYA_HOME` to an isolated temporary directory.

## Extension Points

- MCP servers add external tools, resources, and prompts through config.
- Skills add reusable instructions under `~/.raya/skills/<name>/SKILL.md`.
- Pi packages can contribute provider or skill capabilities.
- Workspace `AGENTS.md` and `SOUL.md` specialize behavior for a project or user.

## Source Versus Installed Raya

When source behavior differs from the `raya` command, compare `command -v raya`, `raya --version`, package metadata, and `node dist/cli/index.js`. Build before testing `dist`; reinstall the package only when the user actually wants the global installation updated.
