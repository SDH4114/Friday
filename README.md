# Raya

Raya is an MIT-licensed, open-source personal AI PC assistant and coding-agent harness for macOS and Linux. It is deliberately built for a useful daily workflow: one terminal session can work on code, inspect and edit local files, run shell commands, search the web, control applications, and optionally stay reachable through your own Telegram bot.

Raya uses **OpenAI Codex via ChatGPT Plus/Pro/Codex OAuth** and API-key providers through the `@earendil-works/pi-ai` adapter: Anthropic, OpenRouter, OpenCode Zen, and Hugging Face. It uses `@earendil-works/pi-agent-core` rather than reimplementing an agent loop.

## Install

macOS and Linux only (Windows is not supported in v1):

```bash
curl -fsSL https://raw.githubusercontent.com/SDH4114/Friday/prime/install.sh | bash
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
raya gateway --restart
```

The terminal UI is intentionally English and has a calm blue/gray palette. Model output streams live, tools and their results render inline, and Raya answers in the language of the user's request.

The input prompt shows `[Plan]` or `[Build]`; press Tab on an empty input line to switch modes for the current session only. Plan exposes only file-reading tools and a restricted set of simple, read-only shell inspection commands. Build enables file and app changes, but every consequential action shows an **Accept / Refuse** approval picker (arrow keys plus Enter). Start a line with `!` to enter `[Term]` and run that shell command directly in your terminal—the command is never sent to Raya or saved in its conversation. Type `/` anywhere else in the input line to open a terminal dropdown of slash commands at the cursor. Use the Up/Down arrow keys to move through it and Enter to select an item. Selecting `/sessions` opens a second dropdown with `New session` and every saved session; selecting one clears the terminal and restores its conversation.

Useful interactive commands:

```text
/help
/models
/model <model>
/thinking
/security
/sessions
/clear
/exit
```

## Tools

All tools implement the same `RayaTool` contract (`name`, `description`, JSON schema, `execute()`), so more tools can later be added without changing the agent core.

- `shell` — executes commands in the workspace.
- `web` — DuckDuckGo text search and URL fetch.
- `list_files`, `read_file`, `write_file` — workspace filesystem access. Writing is available in Build mode.
- `app_control` — opens applications and closes named apps/processes on macOS/Linux.

Plan mode blocks common mutating shell commands; Build mode permits normal local work. This is a convenience policy, not a security sandbox.

## AGENTS.md and SOUL.md

On every agent creation Raya reads these optional files from the current working directory and appends them to the system context:

- `AGENTS.md` contains project instructions.
- `SOUL.md` is your user-authored Raya personality: tone, style, and character.

`SOUL.md` is not a hidden system prompt; it is deliberately a file you own and may edit at any time.

## Sessions and long-term-memory foundation

Structured session state is stored in `~/.raya/sessions.json`. Every save also creates a readable Markdown transcript under:

```text
~/.raya/memory/sessions/YYYY-MM-DD/<session-id>.md
```

`src/memory/skill.ts` is the intentionally small hook for a future memory skill to choose which durable facts to extract. The storage and history-reading foundation are complete, but automatic “what should be remembered” logic is **TODO for the user/project** in v1.

Set `RAYA_HOME=/path` to move config, OAuth credentials, sessions, and memory. Default model and mode are configured with `raya config --model <model> --mode plan|build`. OAuth credentials and Telegram tokens are stored with owner-only permissions in `~/.raya/.env`, separate from non-sensitive configuration.

To bypass Build-mode approval for trusted shell command prefixes, or to prohibit a command entirely, add `autoApproveCommands` and `blockedCommands` in `~/.raya/config.json`:

```json
{
  "autoApproveCommands": ["npm test", "git status"],
  "blockedCommands": ["rm", "rm -rf"]
}
```

Blocked commands are rejected before Raya invokes the shell, in either mode. The `/thinking` picker only shows effort levels the active provider/model reports as supported.

## Skills

Raya automatically loads `SKILL.md` instructions from both `~/.raya/skills/<skill>/SKILL.md` and `<workspace>/.agents/skills/<skill>/SKILL.md`. Relevant skills are supplied to the agent at session start, so it can apply their workflow without a separate command. Skills are context instructions, never executable code by themselves.

## Subagents and pi packages

Raya exposes a `subagent` tool. The model can automatically delegate a bounded investigation or implementation task to an isolated agent with its own context and the current Plan/Build restrictions.

Install a package from [pi.dev/packages](https://pi.dev/packages):

```bash
raya plugin install npm:pi-subagents
raya plugin list
```

Skills shipped inside installed pi packages are loaded on the next session. Native Pi CLI extensions use a different host API; they require a Raya adapter and are not executed blindly as arbitrary npm code.

## Persistent memory and scheduling

Raya injects bounded frozen snapshots from `~/.raya/USER.md` (1,375 chars) and `~/.raya/MEMORY.md` (2,200 chars). The `memory` tool can add, replace, and remove compact entries; writes are persisted immediately and appear in the next session's prompt.

The `schedule` tool stores one-time and daily tasks in `~/.raya/scheduled.json`. Due tasks are delivered while the Raya TUI or Telegram gateway is running; restarting Raya reloads pending tasks from disk.

Security can be selected interactively with `/security`, or configured as the default with `raya config --security standard|full`. Standard asks for consequential Build actions. Full skips approval prompts, while `blockedCommands` remains an absolute deny-list.

## Telegram

Create a bot with [@BotFather](https://t.me/BotFather), copy its token, then enter it during Raya's first interactive run. A configured bot receives messages only while the Raya CLI process is running on your computer; it is not a hosted 24/7 service. Closing Raya or turning off the computer makes the bot unavailable—this is an intentional v1 limitation.

Use `raya gateway --setup` to change the bot token or allowed chat ID. `raya gateway --restart` starts a fresh local Telegram gateway process, useful when the TUI is not running.

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
- A complete memory-skill policy and plugin loader.
- Windows support.

## Publishing

Authenticate to npm as the `@sdh4114` maintainer, update the version, then run:

```bash
npm publish --access public
```

`prepack` runs the production build. GitHub remains the host for `install.sh`; npm is only the package registry.

## License

[MIT](./LICENSE)
