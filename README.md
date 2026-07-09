# Raya

Raya is an open-source AI coding agent harness for the terminal. It is built as a TypeScript/Node.js npm CLI and uses the `earendil-works/pi` packages for model access, OpenAI Codex OAuth, and the base agent runtime.

Raya defaults to OpenAI Codex through ChatGPT Plus/Pro/Codex OAuth, and can also connect to other `pi-ai` providers such as Anthropic API, OpenAI API, OpenCode Zen, and OpenRouter.

## Install

From the `prime` branch:

```bash
curl -fsSL https://raw.githubusercontent.com/SDH4114/Friday/prime/install.sh | bash
```

The installer supports macOS and Linux. It checks for Node.js 22+, installs Node 22 through `nvm` when needed, clones this repository, builds the CLI, and installs `raya` globally with npm.

Manual development install:

```bash
npm install
npm run build
npm link
raya
```

## First Run

```bash
raya login
raya
```

`raya login` first shows a provider menu. Choose one of the common providers or type any provider id from `raya providers`.

Credentials are stored in:

```text
~/.raya/auth.json
```

Raya writes the file with `0600` permissions. Basic config is stored in:

```text
~/.raya/config.json
```

Set `RAYA_HOME=/custom/path` to move both files, which is useful in CI and isolated test environments.

## CLI

```bash
raya                 # interactive TUI
raya "fix tests"    # one-shot prompt
raya --run-model gpt-5.4-mini "fix tests"
raya login          # provider menu, then login
raya login openai-codex
raya login anthropic
raya logout         # remove local provider credential
raya status         # show config/auth status
raya providers      # list built-in providers
raya models         # list configured provider models
raya models --provider openrouter
raya config --model gpt-5.4-mini
raya config --provider anthropic --model claude-sonnet-4-5 --mode edit
```

In the interactive terminal UI:

- `/exit` quits.
- `/clear` resets the current conversation.
- Model output streams in real time.
- Tool calls and tool results are shown inline.

Slash commands:

```text
/help                         show commands
/providers                    list providers
/login [provider]             login/add provider credential
/provider <provider>           switch provider
/models [provider]             list models
/model <model>                 switch model
/mode plan|edit                switch Plan/Edit mode
/sessions                     list sessions
/session new [name]            create session
/session switch <id|name>      switch session
/status                       show current config
/clear                        clear current session messages
/exit                         quit
```

## Architecture

Main modules:

- `src/cli/index.ts` - CLI entry and commands.
- `src/providers/runtime.ts` - adapter around the built-in `@earendil-works/pi-ai` provider catalog.
- `src/providers/file-credential-store.ts` - local `CredentialStore` for `~/.raya/auth.json`.
- `src/session/store.ts` - local session storage for `~/.raya/sessions.json`.
- `src/agent/create-agent.ts` - `@earendil-works/pi-agent-core.Agent` wiring.
- `src/tools/*` - extensible tools using a single `Tool { name, description, parameters, execute() }` contract.
- `src/tui/*` - minimal terminal UI using `readline` plus `@earendil-works/pi-tui` display utilities.
- `install.sh` - macOS/Linux installer for `curl | bash`.

The current agent loop is provided by `@earendil-works/pi-agent-core.Agent`. Raya supplies the model stream function from `pi-ai`, the system prompt, tool registry, and terminal event renderer.

## Tools

v1 includes:

- `shell` - runs shell commands in the current working directory.
- `web` - searches the web through DuckDuckGo HTML results or fetches a URL and returns text excerpts.
- `list_files` - lists workspace files.
- `read_file` - reads workspace text files.
- `write_file` - writes workspace text files, only in Edit mode.

Modes:

- `Plan` - read/investigate mode. File tools are read-only, and shell blocks obvious mutating commands.
- `Edit` - change mode. Adds `write_file` and allows normal shell execution.

New tools should implement `RayaTool` from `src/types/tool.ts` and be registered in `src/tools/index.ts`.

## Assumptions

- Project name is `Raya`; no rename was needed.
- The npm package name is `@sdh4114/raya` because the unscoped `raya` package name is already taken on npm. The installed binary is still `raya`.
- Node.js 22 is the baseline for v1 because the current dependency stack builds and runs on Node 22 LTS, while newer Node 24 installations also work.
- `@earendil-works/pi-ai` is the source of truth for provider auth, model catalogs, and token refresh.
- `@earendil-works/pi-tui` is reused for terminal text utilities, while v1 keeps rendering intentionally small instead of building a full-screen TUI.
- The install script installs from GitHub source and builds locally because the package is not assumed to be published to npm yet.

## Known Limitations

- Shell execution is not fully sandboxed. Treat `shell` as equivalent to the user running the command in their terminal.
- The web search tool uses public DuckDuckGo HTML pages and can be rate-limited or blocked.
- There is no plugin loader. Tools have a clear extension point, but loading third-party extensions is out of scope.

## TODO v2

- Add command approval and sandboxing for shell.
- Add a plugin/extension loader after the tool API stabilizes.
- Replace the minimal TUI with a richer full-screen renderer if `pi-tui` exposes the right high-level app primitives for this workflow.

## License

MIT
