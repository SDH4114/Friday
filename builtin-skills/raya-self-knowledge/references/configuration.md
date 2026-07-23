# Raya Configuration and State

## Paths

Raya uses `~/.raya` by default and honors `RAYA_HOME` for isolation. Resolve exact paths through `src/config/paths.ts` rather than duplicating them.

- `config.json`: non-secret validated settings.
- `commands.json`: validated user-created direct commands (`name`, executable, fixed arguments, and optional description/cwd).
- `.env`: provider and Telegram credentials plus the exact `RAYA_BACKUP_TARGET`, with owner-only permissions.
- `sessions.json`: conversations, workspace/profile binding, and per-session config snapshots.
- `USER.md`: bounded global user context.
- `profiles/<name>/SOUL.md`, `AGENTS.md`, `MEMORY.md`, `profile.json`, and `sessions/`: isolated role identity, instructions, durable knowledge, metadata, and readable transcripts.
- `skills/`, `plugins/`, `scheduled.json`, and `web.json`: shared capability-specific state.

## Config Fields

- Profile: `activeProfile`.
- Model: `provider`, `model`, `thinkingLevel`, `localModels`.
- Behavior: `mode`, `securityMode`, `autoApproveCommands`, `blockedCommands`.
- Interface: `headerStyle`, `theme`, `hotkeys`.
- Extensions: `piPackages`, `mcpServers`.
- Backup: optional `backup` object with `mode`, display `name`, optional absolute local `directory`, optional sanitized `repository`, and `configuredAt`.
- Limits: `shellTimeoutMs`, `webTimeoutMs`, `webMaxChars`.

Core TUI hotkeys are `toggleMode`, `cancel`, `exit`, and `clearScreen`. Values use normalized chords such as `tab`, `escape`, `ctrl+c`, `ctrl+l`, `ctrl+shift+p`, or `meta+k`. Bindings must be valid and unique. Configure them with repeated `raya config --hotkey action=key` flags or restore defaults with `raya config --reset-hotkeys`.

## MCP Config

Each `mcpServers.<name>` entry contains `enabled`, `approval`, `timeoutMs`, and `toolTimeoutMs`, plus one transport:

- stdio: `transport: "stdio"`, `command`, `args`, optional `cwd`, and `env`.
- Streamable HTTP: `transport: "http"`, `url`, and `headers`.
- legacy SSE: `transport: "sse"`, `url`, and `headers`.

Compatibility normalization accepts `type` as an alias for `transport` and infers stdio from `command` or HTTP from `url`. `${ENV_VAR}` placeholders are expanded at connection time so tokens need not be written into config.

Plan allows only MCP tools explicitly marked read-only. Build permits other MCP tools and applies the server's `approval` setting. Treat annotations as external claims, not proof of safety.

## Backup State

`raya backup --setup` or the first unconfigured `raya backup` writes non-secret backup metadata through `updateConfig` and the exact local root or Git URL through owner-only `.env` storage. Each new local version is an independent `~/raya-backups/<name>/` folder containing code, `.raya`, `manifest.json`, and `raya-package.tgz` directly at its root. There are no date folders, wrapper folders, or local Git repository, and duplicate names are rejected instead of overwritten. GitHub mode excludes `.env` and `auth.json`, stages only `.raya-backup`, and performs create/list/restore through a temporary clone outside `~/raya-backups` that is always removed afterward. `--list` groups GitHub and Local versions. Restore always asks for the source and requires typed confirmation before reinstalling code and restoring state. Legacy nested local snapshots remain readable and restorable.

`raya update` does not depend on or change the configured backup mode. After update confirmation it always creates a local checkpoint under the backup root, then launches the pinned installer with a temporary `RAYA_HOME`. Loading the update command itself must also avoid config normalization, profile migration, skill synchronization, and custom-command initialization so malformed or hand-edited state remains untouched.

## Update Rules

- Parse all stored or imported values through `normalizeConfig`.
- Parse `commands.json` through its dedicated schema in `src/commands/store.ts`; do not merge it into general config.
- Use `updateConfig` for partial updates; it preserves unknown keys used by future versions or integrations.
- Keep secrets out of config, sessions, skills, logs, and fixtures.
- Migrations should be additive, backward compatible, and regression tested.
- Global settings must be deliberately merged when rebuilding an older session so stale snapshots do not silently undo them.
- Profile switching must rebuild the agent and start a clean profile-bound session because system prompts and memory snapshots are frozen at agent creation.
