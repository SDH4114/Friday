# Raya Configuration and State

## Paths

Raya uses `~/.raya` by default and honors `RAYA_HOME` for isolation. Resolve exact paths through `src/config/paths.ts` rather than duplicating them.

- `config.json`: non-secret validated settings.
- `commands.json`: validated user-created direct commands (`name`, executable, fixed arguments, and optional description/cwd).
- `.env`: provider and Telegram credentials with owner-only permissions.
- `sessions.json`: conversations, workspace binding, and per-session config snapshots.
- `USER.md` and `MEMORY.md`: bounded durable context.
- `skills/`, `plugins/`, `memory/sessions/`, `scheduled.json`, `web.json`, and `neovim.json`: capability-specific state.

## Config Fields

- Model: `provider`, `model`, `thinkingLevel`, `localModels`.
- Behavior: `mode`, `securityMode`, `autoApproveCommands`, `blockedCommands`.
- Interface: `headerStyle`, `theme`, `neovim_mode`, `hotkeys`.
- Extensions: `piPackages`, `mcpServers`.
- Limits: `shellTimeoutMs`, `webTimeoutMs`, `webMaxChars`.

Core TUI hotkeys are `toggleMode`, `cancel`, `exit`, and `clearScreen`. Values use normalized chords such as `tab`, `escape`, `ctrl+c`, `ctrl+l`, `ctrl+shift+p`, or `meta+k`. Bindings must be valid and unique. Configure them with repeated `raya config --hotkey action=key` flags or restore defaults with `raya config --reset-hotkeys`.

## MCP Config

Each `mcpServers.<name>` entry contains `enabled`, `approval`, `timeoutMs`, and `toolTimeoutMs`, plus one transport:

- stdio: `transport: "stdio"`, `command`, `args`, optional `cwd`, and `env`.
- Streamable HTTP: `transport: "http"`, `url`, and `headers`.
- legacy SSE: `transport: "sse"`, `url`, and `headers`.

Compatibility normalization accepts `type` as an alias for `transport` and infers stdio from `command` or HTTP from `url`. `${ENV_VAR}` placeholders are expanded at connection time so tokens need not be written into config.

Plan allows only MCP tools explicitly marked read-only. Build permits other MCP tools and applies the server's `approval` setting. Treat annotations as external claims, not proof of safety.

## Update Rules

- Parse all stored or imported values through `normalizeConfig`.
- Parse `commands.json` through its dedicated schema in `src/commands/store.ts`; do not merge it into general config.
- Use `updateConfig` for partial updates; it preserves unknown keys used by future versions or integrations.
- Keep secrets out of config, sessions, skills, logs, and fixtures.
- Migrations should be additive, backward compatible, and regression tested.
- Global settings must be deliberately merged when rebuilding an older session so stale snapshots do not silently undo them.
