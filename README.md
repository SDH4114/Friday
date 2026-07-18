# Raya

Raya is an MIT-licensed, open-source personal AI PC assistant and coding-agent harness for macOS and Linux. It is deliberately built for a useful daily workflow: one terminal session can work on code, inspect and edit local files, run shell commands, search the web, control applications, and optionally stay reachable through your own Telegram bot.

Raya uses **OpenAI Codex via ChatGPT Plus/Pro/Codex OAuth** and API-key providers through the `@earendil-works/pi-ai` adapter: Anthropic, OpenRouter, OpenCode Zen, and Hugging Face. It uses `@earendil-works/pi-agent-core` rather than reimplementing an agent loop.

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
raya gateway --setup
raya gateway --start
raya gateway --restart
```

The terminal UI is intentionally English and uses a monochrome blue palette, including prompts, status messages, approvals, errors, Markdown accents, and tool activity. Every submitted prompt is echoed as `[Plan] > …` or `[Build] > …`, followed by one `Raya` heading and a readable Markdown-rendered answer. Responses support headings, bold, italic, strikethrough, links, inline code, fenced code blocks, lists, task lists, blockquotes, tables, horizontal rules, and semantic terminal colors. Explicit tags such as `{cyan}text{/cyan}`, `red`, `green`, `yellow`, `blue`, `magenta`, `gray`, and `white` are retained for model compatibility but rendered as distinct shades of blue. Tool work is shown immediately as readable expanded blocks such as `Raya is reading …`, `Raya is editing …`, or `Raya is searching …`, including the action input and result. Concurrent actions are separated by one blank line.

The input prompt shows `[Plan]` or `[Build]`; press Tab at any time to switch modes for the current session only. Existing input and cursor position are preserved. Plan exposes only file-reading tools and a restricted set of simple, read-only shell inspection commands. Build enables file and app changes, but every consequential action shows an **Accept / Refuse** approval picker (arrow keys plus Enter). Start a line with `!` to enter `[Term]` and run that shell command directly in your terminal—the command is never sent to Raya or saved in its conversation. Type `/` anywhere else in the input line to open the main slash-command dropdown. A command-specific dropdown opens only after entering `/models`, `/providers`, `/sessions`, `/thinking`, or `/security` and pressing Enter. `/models` and `/providers` contain the complete built-in catalogs and scroll around the selected row. Use the Up/Down arrow keys to move, Enter to select, and Escape to close any open list. While Raya is generating or running tools, Escape aborts the current run and rolls its unfinished messages out of the session. In `/sessions`, Enter opens the selected session; pressing `dd` on it requests deletion and then shows an **Accept / Refuse** confirmation. `Ctrl+C` exits immediately and prints `Bye bye`. A permanent footer below the input shows context usage, active model, working directory, and Raya version.

The startup screen is a responsive Raya dashboard: identity and live session state appear beside Raya-specific workflow guidance and controls. It becomes a stacked panel in narrow terminals. Use `raya config --design large` for the expanded ASCII identity panel, or `raya config --design small` for the compact core mark.

Neovim input is optional. Enable it with `raya config --neovim true` and disable it with `raya config --neovim false`. When enabled, the single-line prompt starts in `NORMAL` mode and displays the current `NORMAL`, `INSERT`, `VISUAL`, or `REPLACE` state. It supports Unicode/grapheme-safe motions and counts, `i/a/I/A/gI/o/O`, `h/l/w/W/b/B/e/E/0/^/$/gg/G`, `f/F/t/T/;/,`, `d/c/y` operators, combined operator counts, `dd/cc/yy`, word and delimiter text objects such as `diw`, `daw`, `ci"`, and `da(`, `x/X/D/C/Y/s/S`, visual and visual-line selection, `p/P`, `r/R`, `u`, `Ctrl+R`, `.`, `~`, and prompt history through `j/k`. Insert sessions are grouped into one undo operation. `/` enters Insert mode and opens Raya's command palette. The complete default key map is created at `~/.raya/neovim.json` when Neovim mode is first enabled and is automatically extended with new defaults without replacing custom bindings. Existing `vim_mode` and `~/.raya/vim.json` settings are imported automatically on first use.

Useful interactive commands:

```text
/help
/providers
/models
/thinking
/security
/sessions
/About
/clear
/exit
```

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

Every ordinary `raya` launch starts with a transient empty session. It is not written to disk until the first message is sent. At that point Raya derives a readable session name from the first prompt instead of using a random identifier. Previous non-empty sessions remain available from `/sessions`, including their prompts, answers, tool calls, model, mode, and security settings.

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

Raya automatically loads `SKILL.md` instructions from both `~/.raya/skills/<skill>/SKILL.md` and `<workspace>/.agents/skills/<skill>/SKILL.md`. Relevant skills are supplied to the agent at session start. Before applying one, the agent calls its built-in `use_skill` marker so the TUI can show `Raya is using skill …`. Skills are context instructions, never executable code by themselves.

At startup Raya prefers `~/.raya/AGENTS.md`; if it is absent, she walks upward from the current directory and loads the nearest `AGENTS.md`. `SOUL.md` follows the same independent fallback algorithm.

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

The `schedule` tool stores one-time and daily tasks in `~/.raya/scheduled.json`. Due tasks are delivered while the Raya TUI or Telegram gateway is running; restarting Raya reloads pending tasks from disk.

Security can be selected interactively with `/security`, or configured as the default with `raya config --security standard|full`. Standard asks for consequential Build actions. Full skips approval prompts, while `blockedCommands` remains active as a defense-in-depth check.

## Telegram

Create a bot with [@BotFather](https://t.me/BotFather), copy its token, then enter it during Raya's first interactive run. A configured bot receives messages only while the Raya CLI process is running on your computer; it is not a hosted 24/7 service. Closing Raya or turning off the computer makes the bot unavailable—this is an intentional v1 limitation.

Use `raya gateway --setup` to change the bot token or allowed chat ID. `raya gateway --start` starts the local Telegram gateway, useful when the TUI is not running. `raya gateway --restart` starts it again with a fresh Telegram connection.

For a safer remote path, every dangerous tool action requested from Telegram—shell mutation, writing a file, or closing an application—waits for an inline **Approve** or **Deny** button in the Telegram chat. The action does not proceed on timeout or denial. Set an allowed chat ID during setup to restrict who can talk to the running session; otherwise anyone who knows the bot can send read-only requests, so an allowed chat ID is strongly recommended.

## Architecture

- `src/providers/runtime.ts` — `pi-ai` OAuth/API-key provider adapter.
- `src/agent/` — system context and `pi-agent-core` loop wiring.
- `src/tools/` — extensible tool registry.
- `src/tui/` — streaming terminal UI using `pi-tui` utilities.
- `src/telegram/service.ts` — same-process Telegram long polling and approval buttons.
- `src/session/` and `src/memory/` — JSON session state, Markdown transcripts, and memory-skill hook.
- `src/cli/index.ts` — command entry point and session lifecycle.

## v1 assumptions and known limits

- OpenAI Codex uses OAuth; Anthropic, OpenRouter, OpenCode Zen, and Hugging Face use their respective API keys.
- Shell and filesystem access are **not sandboxed**; run Raya only in a trusted workspace.
- Web browsing is text search/fetch only: no browser clicking or form automation.
- Telegram runs in the local CLI process, not on a server.
- A complete third-party plugin system is out of scope; the tool registry and memory hook are the extension points.

## v2 TODO

- Additional provider adapters and provider-specific setup improvements.
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
