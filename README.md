# Raya

Raya is an MIT-licensed, open-source personal AI PC assistant and coding-agent harness for macOS and Linux. It is deliberately built for a useful daily workflow: one terminal session can work on code, inspect and edit local files, run shell commands, search the web, control applications, and optionally stay reachable through your own Telegram bot.

Raya uses **OpenAI Codex via ChatGPT Plus/Pro/Codex OAuth**, API-key providers through the `@earendil-works/pi-ai` adapter, and local OpenAI-compatible inference servers such as Ollama, LM Studio, vLLM, and llama.cpp. It uses `@earendil-works/pi-agent-core` rather than reimplementing an agent loop.

## Install

macOS and Linux only (Windows is not supported in v1):

```bash
curl -fsSL https://raw.githubusercontent.com/SDH4114/Raya-APPLE/prime/install.sh | bash
```

The installer installs Node.js 22 with `nvm` if needed, downloads the repository, builds it, and installs the `raya` binary globally. This GitHub-source approach works before the npm package is published. After publishing `@sdh4114/raya`, the equivalent install is:

```bash
npm install -g @sdh4114/raya
```

For development:

```bash
npm install
npm run build
npm link
raya
```

## First run

```bash
raya
```

If Raya has no credential it opens the OpenAI Codex OAuth flow. Complete it with the ChatGPT/Codex account that has your subscription. The first interactive launch also offers an optional Telegram bot token and optional allowed chat ID; no manual config editing is needed.

```bash
raya login             # repeat OAuth login
raya "explain this repository"  # one-shot prompt
raya status
raya models
raya local add qwen3:8b             # Ollama at 127.0.0.1:11434
raya local list
raya gateway --setup
raya gateway --start
raya gateway --restart
raya mcp list
raya skills list
raya web               # open the full local Web application
```

The terminal UI is intentionally English. Every submitted prompt is echoed as `[Plan] > …` or `[Build] > …`, followed by one `Raya` heading and a readable Markdown-rendered answer. Responses support headings, bold, italic, strikethrough, links, inline code, fenced code blocks, lists, task lists, blockquotes, tables, horizontal rules, and semantic terminal colors. Tool work appears immediately in compact activity panels. File writes show a unified diff with a dark red background and bright readable text for removed lines, a dark green background and bright readable text for added lines, and `+/-` totals. Shell panels show the command, readable output, and exit code instead of a raw JSON dump. This makes coding work reviewable before the next prompt while keeping concurrent actions visually separated.

Raya ships with two complete palettes:

- **Ocean Blue** — the original focused blue palette.
- **Sunset Red** — a high-contrast red, pink, and orange palette.

Enter `/theme` and press Enter to open the theme picker. Selecting a palette applies it immediately and saves it as the global theme without changing any other `config.json` setting. The theme can also be set directly:

```bash
raya config --theme ocean
raya config --theme sunset
```

The input prompt shows `[Plan]` or `[Build]`; the default Tab hotkey switches modes for the current session while preserving the input and cursor. Outside a menu, plain Up/Down arrows move through earlier submitted prompts and restore the unfinished draft at the newest position. Inside a `/` menu they move through choices. Plan exposes investigation-oriented tools; Build enables file and app changes, with an **Accept / Refuse** picker for consequential actions in Standard security. Start a line with `!` to run it directly in your terminal without sending it to Raya or saving it in the conversation. Type `/` elsewhere to open the command dropdown. Enter opens or selects, the cancel hotkey closes a menu or aborts an active run and rolls back unfinished messages, and the exit hotkey quits with `Bye bye`. In `/sessions`, `dd` requests deletion and then shows confirmation. A permanent footer shows context usage, the active model with its reasoning level such as `GPT-5.5 (medium)`, working directory, and Raya version. Changing `/thinking` updates this footer immediately.

Core TUI hotkeys are configurable and shown with their active values on the startup dashboard and in `raya status`. Chords are case-insensitive and support `ctrl`, `meta` (Option on macOS), `shift`, named keys, letters, digits, and `F1`–`F12`. Bindings must be unique.

```bash
raya config --hotkey toggleMode=ctrl+m
raya config --hotkey cancel=ctrl+x --hotkey exit=ctrl+q
raya config --hotkey clearScreen=meta+l
raya config --reset-hotkeys
```

The defaults are `tab`, `escape`, `ctrl+c`, and `ctrl+l` for `toggleMode`, `cancel`, `exit`, and `clearScreen` respectively. They are stored under `hotkeys` in `~/.raya/config.json`.

The startup screen is a responsive Raya dashboard: the Raya logo is aligned to the left with live session state below it, beside Raya-specific workflow guidance and the currently configured controls. It becomes a stacked panel in narrow terminals. Use `raya config --design large` for the expanded ASCII identity panel, or `raya config --design small` for the compact core mark.

Neovim input is optional. Enable it with `raya config --neovim true` and disable it with `raya config --neovim false`. When enabled, the single-line prompt starts in `NORMAL` mode and displays the current `NORMAL`, `INSERT`, `VISUAL`, or `REPLACE` state. It supports Unicode/grapheme-safe motions and counts, `i/a/I/A/gI/o/O`, `h/l/w/W/b/B/e/E/0/^/$/gg/G`, `f/F/t/T/;/,`, `d/c/y` operators, combined operator counts, `dd/cc/yy`, word and delimiter text objects such as `diw`, `daw`, `ci"`, and `da(`, `x/X/D/C/Y/s/S`, visual and visual-line selection, `p/P`, `r/R`, `u`, `Ctrl+R`, `.`, `~`, and prompt history through `j/k`. Insert sessions are grouped into one undo operation. `/` enters Insert mode and opens Raya's command palette. The complete default key map is created at `~/.raya/neovim.json` when Neovim mode is first enabled and is automatically extended with new defaults without replacing custom bindings. Existing `vim_mode` and `~/.raya/vim.json` settings are imported automatically on first use.

Useful interactive commands:

```text
/help
/providers
/models
/thinking
/theme
/security
/sessions
/mcps
/skills
/about
/clear
/exit
```

`/skills` opens a searchable dropdown of all built-in, user, workspace, and package skills. Selecting one inserts a visible `@skill:<name>` marker into the current input instead of sending the command immediately, so you can finish the request and attach that skill to the same message. Raya treats the marker as an explicit instruction to load the selected skill with `use_skill` before answering. The information command is lowercase: `/about`.

Direct shortcuts:

```text
raya yt <text>              Open YouTube search results in the browser
raya search <text>          Open a web search in the browser
raya serach <text>          Alias for raya search (kept for convenience)
raya git                    git add ., ask for a commit name, commit, then push
raya open <application>     Open an application
```

## Tools

All tools implement the same `RayaTool` contract (`name`, `description`, JSON schema, `execute()`), so more tools can later be added without changing the agent core.

- `shell` — executes commands in the workspace.
- `web` — DuckDuckGo text search and public URL fetch; local/private network addresses are blocked.
- `list_files`, `read_file`, `write_file` — workspace filesystem access. Writing is available in Build mode.
- `app_control` — opens applications and closes named apps/processes on macOS/Linux.

Plan mode blocks common mutating shell commands; Build mode permits normal local work. This is a convenience policy, not a security sandbox.

## Local models

Raya can use any local server that implements the OpenAI-compatible chat-completions API. Registering a model does not download it or start its server; start Ollama, LM Studio, vLLM, or llama.cpp first, then add the model to Raya.

Ollama uses `http://127.0.0.1:11434/v1` by default:

```bash
ollama pull qwen3:8b
raya local add qwen3:8b
```

LM Studio commonly uses port 1234:

```bash
raya local add local-model-id \
  --provider lmstudio \
  --base-url http://127.0.0.1:1234/v1 \
  --name "My LM Studio model"
```

Custom vLLM or llama.cpp endpoints work the same way:

```bash
raya local add Qwen/Qwen3-Coder-30B-A3B-Instruct \
  --provider vllm \
  --base-url http://127.0.0.1:8000/v1 \
  --context-window 131072 \
  --max-tokens 16384
```

Manage local entries and select one:

```bash
raya local list
raya local remove qwen3:8b --provider ollama
raya config --provider ollama --model qwen3:8b
```

Local providers are keyless by default, have zero API cost metadata, appear in `/providers` as connected, and appear in `/models` alongside cloud models. Tool calling still depends on the capabilities and chat template of the model served by your local runtime.

## AGENTS.md and SOUL.md

On every agent creation Raya first checks `~/.raya/AGENTS.md` and `~/.raya/SOUL.md`. For each file that is absent there, Raya walks upward from the current working directory and loads the nearest available copy:

- `AGENTS.md` contains project instructions.
- `SOUL.md` is your user-authored Raya personality: tone, style, and character.

`SOUL.md` is not a hidden system prompt; it is deliberately a file you own and may edit at any time.

## Sessions and long-term-memory foundation

Structured session state is stored in `~/.raya/sessions.json`. Every save also creates a readable Markdown transcript under:

```text
~/.raya/memory/sessions/YYYY-MM-DD/<session-id>.md
```

Every ordinary `raya` launch starts with a transient empty session bound to the directory where `raya` was opened. It is not written to disk until the first message is sent. At that point Raya stores the canonical workspace path and derives a readable session name from the first prompt instead of using a random identifier. `/sessions` only shows sessions belonging to the current directory, so similarly named projects cannot mix histories. Existing sessions created before workspace binding are migrated to the directory of the first Raya launch after upgrading. Every session preserves its own Plan/Build mode independently; opening another session restores that session's mode. The color theme remains global.

Raya can autonomously write compact durable facts to `USER.md` and `MEMORY.md` through her memory tool. `src/memory/skill.ts` remains an extension hook for optional post-session consolidation beyond the built-in model-driven behavior.

Set `RAYA_HOME=/path` to move config, OAuth credentials, sessions, and memory. Default model and mode are configured with `raya config --model <model> --mode plan|build`. OAuth credentials and Telegram tokens are stored with owner-only permissions in `~/.raya/.env`, separate from non-sensitive configuration.

To bypass Build-mode approval for trusted shell command prefixes, or to prohibit a command entirely, add `autoApproveCommands` and `blockedCommands` in `~/.raya/config.json`:

```json
{
  "autoApproveCommands": ["npm test", "git status"],
  "blockedCommands": ["rm", "rm -rf"]
}
```

Blocked commands are checked before Raya invokes the shell, including common wrappers and command chains, in either mode. This deny-list is defense in depth rather than a complete shell sandbox. The `/thinking` picker only shows effort levels the active provider/model reports as supported.

## Skills

Raya ships with built-in `debugging`, `implementation`, `project-audit`, `web-research`, `raya-self-knowledge`, and `create-raya-skills` skills. The expanded self-knowledge package is Raya's internal map of her identity, runtime flow, source ownership, interfaces, tools, configuration, hotkeys, MCP formats, persistent stores, safety model, honest limitations, and self-maintenance workflow. It explicitly separates Raya's orchestration from the selected model and separates executable MCP capabilities from instruction-only skills.

The installer copies built-ins into `~/.raya/skills/` and the first Raya startup performs the same sync as a fallback. Existing folders are never replaced automatically, so user edits remain yours. A later Raya update only installs missing skills. Use the explicit force command when you deliberately want every installed built-in, including `raya-self-knowledge`, replaced by the package's current version.

Raya discovers `SKILL.md` metadata from both `~/.raya/skills/<skill>/SKILL.md` and `<workspace>/.agents/skills/<skill>/SKILL.md`. Only the compact catalog is added at session start; complete instructions and requested references are loaded through `use_skill` when relevant. This keeps the model context small and makes skill activation visible in the TUI. Skills are context instructions, never executable code or additional permissions by themselves.

In Build mode Raya can create a persistent skill with the approval-aware `create_skill` tool when the user asks to teach her a reusable workflow. She may propose a skill after noticing a recurring process, but Standard security still asks before it is written. Existing skills are not overwritten unless that exact update was requested.

```bash
raya skills list       # built-in, user, workspace, and package skills
raya skills sync       # install any missing built-in skills
raya skills sync --force # replace installed built-ins with packaged versions
```

At startup Raya prefers `~/.raya/AGENTS.md`; if it is absent, she walks upward from the current directory and loads the nearest `AGENTS.md`. `SOUL.md` follows the same independent fallback algorithm.

## MCP servers

Raya is an MCP client for local `stdio`, remote Streamable HTTP, and legacy SSE servers. Enabled servers connect once when Raya starts and close cleanly when Raya exits, including strict diagnostic runs that only partially connect. Their paginated tools are exposed with collision-safe names such as `mcp_filesystem_read_file`; MCP resources and prompts are available through `mcp_list_resources`, `mcp_read_resource`, `mcp_list_prompts`, and `mcp_get_prompt`. Server instructions are included in the agent context. The same connected MCP tools are available in the terminal, Raya Web, Telegram gateway, and subagents.

Add and test a local server:

```bash
raya mcp add filesystem \
  --command npx \
  --arg=-y \
  --arg @modelcontextprotocol/server-filesystem \
  --arg "$PWD"
raya mcp test filesystem
```

Add a remote server. Environment placeholders keep the actual token out of `config.json`:

```bash
export MY_MCP_TOKEN="..."
raya mcp add company \
  --url https://mcp.example.com/mcp \
  --header 'Authorization=Bearer ${MY_MCP_TOKEN}'
raya mcp test company
```

For an older SSE endpoint, add `--transport sse`. Streamable HTTP remains the default:

```bash
raya mcp add legacy --url https://mcp.example.com/sse --transport sse
raya mcp test legacy
```

Raya also normalizes common MCP JSON copied from other clients: `type` may be used instead of `transport`, and a missing transport is inferred as `stdio` from `command` or `http` from `url`. URL transports are restricted to HTTP(S). Environment placeholders work in commands, arguments, paths, environment values, URLs, and headers.

Manage configured servers:

```bash
raya mcp list
raya mcp disable filesystem
raya mcp enable filesystem
raya mcp remove filesystem
```

Servers are stored visibly under `mcpServers` in `~/.raya/config.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/project"],
      "env": {},
      "approval": "writes",
      "timeoutMs": 30000,
      "toolTimeoutMs": 120000
    },
    "company": {
      "enabled": false,
      "transport": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${MY_MCP_TOKEN}" },
      "approval": "writes",
      "timeoutMs": 30000,
      "toolTimeoutMs": 120000
    }
  }
}
```

`approval` may be `always`, `writes` (default), or `never`. Plan mode only permits MCP tools that the server marks read-only. In Standard Build mode, tools not marked read-only ask for the normal Raya approval unless the server is configured with `approval: "never"`. Full access skips interactive approvals. A server that fails to connect is reported once and does not prevent Raya or the other MCP servers from starting. `raya mcp test <name>` is strict: it returns a failing exit status and closes any other connection opened during the diagnostic.

## Subagents and pi packages

Raya exposes a `subagent` tool. The model can automatically delegate a bounded investigation or implementation task to an isolated agent with its own context and the current Plan/Build restrictions.

Install a package from [pi.dev/packages](https://pi.dev/packages):

```bash
raya plugin install npm:pi-subagents
raya plugin list
```

Skills shipped inside installed pi packages are loaded on the next session. Package install scripts are disabled. Native Pi CLI extensions use a different host API; they require a Raya adapter and are not executed blindly as arbitrary npm code.

## Persistent memory and scheduling

Raya injects bounded frozen snapshots from `~/.raya/USER.md` (1,375 chars) and `~/.raya/MEMORY.md` (2,200 chars). Raya autonomously saves durable preferences, corrections, project decisions, and reusable lessons through the `memory` tool; writes are persisted immediately and appear in the next session's prompt. She can also list, search, and read saved sessions when earlier context is relevant.

The `schedule` tool stores one-time and daily tasks in `~/.raya/scheduled.json`. Every scheduled task is delivered through Telegram; a failed or unavailable Telegram delivery leaves the task pending for retry. Reminders created in Raya Web are sent to Telegram and additionally shown as browser notifications. Restarting Raya reloads pending tasks from disk.

## Raya Web

Run `raya web` to open the full local application at `http://127.0.0.1:4177`. Use `raya web --port <port>` to choose another port or `raya web --no-open` to start without opening the browser. The server binds only to localhost.

Raya Web includes the existing agent and session workflow plus Calendar, Reminders, Scheduled tasks, Workspaces, and connected Notes. Each registered workspace folder can edit its own `AGENTS.md` and `SOUL.md`; selecting that workspace gives the chat agent the matching folder context and filesystem root. Notes create bidirectional graph links with `[[Note title]]`. Web data is kept in `~/.raya/web.json` with owner-only permissions.

Security can be selected interactively with `/security`, or configured as the default with `raya config --security standard|full`. Standard asks for consequential Build actions. Full skips approval prompts, while `blockedCommands` remains active as a defense-in-depth check.

## Telegram

Create a bot with [@BotFather](https://t.me/BotFather), copy its token, then enter it during Raya's first interactive run. A configured bot receives messages only while the Raya CLI process is running on your computer; it is not a hosted 24/7 service. Closing Raya or turning off the computer makes the bot unavailable—this is an intentional v1 limitation.

Use `raya gateway --setup` to change the bot token or allowed chat ID. `raya gateway --start` starts the local Telegram gateway, useful when the TUI is not running. `raya gateway --restart` starts it again with a fresh Telegram connection.

For a safer remote path, every dangerous tool action requested from Telegram—shell mutation, writing a file, or closing an application—waits for an inline **Approve** or **Deny** button in the Telegram chat. The action does not proceed on timeout or denial. Set an allowed chat ID during setup to restrict who can talk to the running session; otherwise anyone who knows the bot can send read-only requests, so an allowed chat ID is strongly recommended.

## Architecture

- `src/providers/runtime.ts` — cloud and local OpenAI-compatible provider adapters.
- `src/agent/` — system context and `pi-agent-core` loop wiring.
- `src/tools/` — extensible tool registry.
- `src/tui/` — streaming terminal UI using `pi-tui` utilities.
- `src/tui/hotkeys.ts` — validated configurable key chords and matching.
- `src/telegram/service.ts` — same-process Telegram long polling and approval buttons.
- `src/mcp/client.ts` — MCP transports, capability discovery, tool adapters, resources, prompts, and lifecycle.
- `src/skills/` and `builtin-skills/` — skill discovery and first-run built-in installation.
- `src/session/` and `src/memory/` — JSON session state, Markdown transcripts, and memory-skill hook.
- `src/cli/index.ts` — command entry point and session lifecycle.

## v1 assumptions and known limits

- OpenAI Codex uses OAuth; Anthropic, OpenRouter, OpenCode Zen, and Hugging Face use their respective API keys.
- Shell and filesystem access are **not sandboxed**; run Raya only in a trusted workspace.
- Web browsing is text search/fetch only: no browser clicking or form automation.
- Telegram runs in the local CLI process, not on a server.
- Native Pi CLI extensions still require a Raya adapter; MCP and instruction skills are supported directly.

## v2 TODO

- Provider-specific setup and local model discovery improvements.
- Real sandboxing and configurable local approvals.
- Browser automation.
- Optional post-session memory consolidation and a complete plugin loader.
- Windows support.

## Publishing

Authenticate to npm as the `@sdh4114` maintainer, update the version, then run:

```bash
npm publish --access public
```

`prepack` runs the production build. GitHub remains the host for `install.sh`; npm is only the package registry.

## License

[MIT](./LICENSE)
