# Raya Capabilities and Limits

`src/agent/capabilities.ts` is the executable shared catalog injected into Raya's system prompt and rendered by `/about` and `/help`. It covers every built-in top-level command (`commands`, `local`, `web`, provider auth, Telegram gateway, plugins, MCP, skills, status/config, providers/models, search shortcuts, Git, and application opening), every slash command, every core tool, connected MCP resource/prompt adapters, persistent stores, and honest limits. Personal commands from `commands.json` are added to the prompt dynamically. Verify new functionality there as well as at its real registration point so Raya never describes stale or imaginary capabilities.

## Interfaces

- Interactive TUI: streaming chat, Plan/Build switching, configurable core hotkeys, slash menus, prompt history, direct terminal lines, themes, sessions, and optional Neovim editing. The footer shows the active model and reasoning level. `/skills` attaches a selected skill to the current message as `@skill:<name>`, and `/about` is lowercase.
- One-shot CLI: run one prompt with the configured provider and tools.
- Direct CLI commands: built-ins such as `raya git` and `raya open`, plus user-created shortcuts managed with `raya commands add|list|show|remove`. Extra invocation arguments are appended to the saved argument vector.
- Raya Web: local multi-pane chat, workspaces, AGENTS.md and SOUL.md editing, calendar, reminders, scheduled work, and linked notes.
- Telegram: local long-polling gateway with chat restriction and inline approval for consequential remote actions.
- Scheduler: persistent one-time and daily reminders delivered through the configured interface path.
- Subagents: bounded isolated agent work that inherits the current mode, model runtime, workspace policy, and connected MCP runtime.

## Core Tools

- Workspace file listing, reading, writing, and readable diffs.
- Approval-aware shell execution with blocked-command checks and bounded output.
- Public web text search and fetch with private/local network protection.
- Application open/close control where the operating system supports it.
- Session discovery, durable memory writes, scheduling, skill loading, and Build-only skill authoring.

The authoritative list is `createDefaultTools` in `src/tools/index.ts`; mode and platform can change which tools are present.

## Extensibility

- MCP: stdio, Streamable HTTP, and legacy SSE servers can add tools, resources, prompts, and server instructions. Common `mcpServers` configs with omitted `transport` or a `type` alias are normalized.
- Skills: packaged, user, workspace, and supported package skills add progressive instructions. They do not execute code or grant permissions.
- Local models: OpenAI-compatible endpoints such as Ollama, LM Studio, vLLM, and llama.cpp can be registered without API keys.
- Pi packages: package skills are discoverable; native Pi extensions require an explicit Raya adapter.
- User commands: local executable shortcuts are stored separately from config and launched without a shell. They are appropriate for trusted repeatable commands, not secret storage or agent tool extension.

## Safety Model

- Plan restricts mutation. Build enables it.
- Standard security asks before consequential Build actions. Full security suppresses the interactive approval step.
- `blockedCommands`, path containment, private-network checks, credential separation, package validation, and atomic persistence are defense-in-depth controls.
- Raya is not an OS sandbox. Shell and filesystem tools run with the local user's permissions.

## Honest Limits

- Raya is active only while its local process is running; Telegram and reminders are not a hosted cloud service.
- Web research is text search/fetch, not full browser automation.
- Provider/model quality and tool-calling support vary.
- External MCP servers remain separate trust domains and can fail, return untrusted content, or mislabel mutating tools.
- Native Pi extensions do not run without an adapter.
- Supported host assumptions are macOS/Linux and Node.js 22 or newer; Windows remains future work.
