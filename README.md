# Raya

Raya is an MIT-licensed, open-source personal AI PC assistant and coding-agent harness for macOS and Linux. It is deliberately built for a useful daily workflow: one terminal session can work on code, inspect and edit local files, run shell commands, search the web, control applications, and optionally stay reachable through your own Telegram bot.

Raya v1 uses **OpenAI Codex via ChatGPT Plus/Pro/Codex OAuth**. It uses the `@earendil-works/pi-ai` provider adapter and `@earendil-works/pi-agent-core` runtime rather than reimplementing OAuth or an agent loop.

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
```

The terminal UI is intentionally English and has a calm blue/gray palette. Model output streams live, tools and their results render inline, and Raya answers in the language of the user's request.

Useful interactive commands:

```text
/help
/mode plan|edit
/models
/model <model>
/sessions
/session new [name]
/session switch <id|name>
/clear
/exit
```

## Tools

All tools implement the same `RayaTool` contract (`name`, `description`, JSON schema, `execute()`), so more tools can later be added without changing the agent core.

- `shell` — executes commands in the workspace.
- `web` — DuckDuckGo text search and URL fetch.
- `list_files`, `read_file`, `write_file` — workspace filesystem access. Writing is available in Edit mode.
- `app_control` — opens applications and closes named apps/processes on macOS/Linux.

Plan mode blocks common mutating shell commands; Edit mode permits normal local work. This is a convenience policy, not a security sandbox.

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

Set `RAYA_HOME=/path` to move config, OAuth credentials, sessions, and memory. Raya writes sensitive local files with owner-only permissions where supported.

## Telegram

Create a bot with [@BotFather](https://t.me/BotFather), copy its token, then enter it during Raya's first interactive run. A configured bot receives messages only while the Raya CLI process is running on your computer; it is not a hosted 24/7 service. Closing Raya or turning off the computer makes the bot unavailable—this is an intentional v1 limitation.

For a safer remote path, every dangerous tool action requested from Telegram—shell mutation, writing a file, or closing an application—waits for an inline **Approve** or **Deny** button in the Telegram chat. The action does not proceed on timeout or denial. Set an allowed chat ID during setup to restrict who can talk to the running session; otherwise anyone who knows the bot can send read-only requests, so an allowed chat ID is strongly recommended.

## Architecture

- `src/providers/runtime.ts` — OpenAI Codex-only `pi-ai` OAuth/model adapter.
- `src/agent/` — system context and `pi-agent-core` loop wiring.
- `src/tools/` — extensible tool registry.
- `src/tui/` — streaming terminal UI using `pi-tui` utilities.
- `src/telegram/service.ts` — same-process Telegram long polling and approval buttons.
- `src/session/` and `src/memory/` — JSON session state, Markdown transcripts, and memory-skill hook.
- `src/cli/index.ts` — command entry point and session lifecycle.

## v1 assumptions and known limits

- Only OpenAI/Codex OAuth is supported. The provider boundary is adapter-based so later providers can be added without replacing the agent loop.
- Shell and filesystem access are **not sandboxed**; run Raya only in a trusted workspace.
- Web browsing is text search/fetch only: no browser clicking or form automation.
- Telegram runs in the local CLI process, not on a server.
- A complete third-party plugin system is out of scope; the tool registry and memory hook are the extension points.

## v2 TODO

- Additional providers (Anthropic and others).
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
