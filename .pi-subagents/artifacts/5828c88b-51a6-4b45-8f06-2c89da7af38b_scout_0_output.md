# Code Context

## Files Retrieved

1. `package.json` (lines 1-44) - npm package metadata, CLI bin, scripts, deps, Node engine.
2. `README.md` (lines 1-151) - factual user-facing behavior, setup, config precedence, commands, image/web/runtime features.
3. `src/index.ts` (lines 1-120, 142-313, 470-705, 781-1081) - only TypeScript source and main CLI/runtime implementation.
4. `tsconfig.json` (lines 1-25) - strict TypeScript/NodeNext build settings.
5. `config.example.json` (lines 1-29) - complete config shape/default example.
6. `.env.example` (lines 1-10) - supported environment variables.
7. `.gitignore` (lines 1-4) - ignored generated/local files.
8. `dist/index.d.ts`, `dist/index.js`, `dist/index.js.map` - built output currently present in working tree but ignored by `.gitignore`.
9. `package-lock.json` - lockfile for npm dependency graph; not deeply read because package surface is small and deps are visible in `package.json`.

## Key Code

### Repo shape

- Single-package Node/TypeScript CLI project.
- Source is effectively monolithic: `src/index.ts` is the only file under `src/`.
- Built artifacts exist under `dist/`: `index.js`, `index.d.ts`, `index.js.map`.
- No test files or test script found.
- `.env` exists locally but was intentionally not read because it likely contains secrets; `.env.example` documents variables.

### Package / scripts / dependencies

`package.json` (lines 1-44):

- Package: `raya-agent`, version `0.1.0`, ESM via `type: module`.
- CLI binary: `raya` -> `./dist/index.js`.
- Scripts:
  - `dev`: `tsx src/index.ts`
  - `build`: `tsc && chmod +x dist/index.js`
  - `start`: `node dist/index.js`
  - `typecheck`: `tsc --noEmit`
- Runtime deps: `dotenv`, `openai`.
- Dev deps: `@types/node`, `tsx`, `typescript`.
- Node engine: `>=20`.

### Core types/defaults

`src/index.ts` (lines 16-111):

- `ChatMessage` aliases OpenAI chat message params.
- `SearchResult`, `WebPage` model DuckDuckGo result and fetched page context.
- `RayaResponse` tracks streamed answer, token estimates, elapsed seconds.
- `ImageAttachment`/`TurnInput` support pasted multimodal image placeholders.
- `RayaConfig` includes `model`, `models`, `mode`, `contextTokens`, `search`, `images`, `retries`, `openrouter`.
- `defaultConfig` defaults to `google/gemma-4-31b-it:free`, mode `Chat`, OpenRouter base URL, 128k context, web/image/retry settings.

### Config and env loading

`src/index.ts` (lines 142-293):

- `loadEnv()` tries env files in order: cwd `.env`, `~/.raya/.env`, package-root `.env`.
- `mergeConfig()` validates/merges partial JSON into `RayaConfig`.
- `ensureGlobalConfig()` creates `~/.raya/config.json` with defaults on first run.
- `loadConfig()` merges config paths in this order: `~/.raya/config.json`, workspace `.raya/config.json`, workspace `raya.config.json`.
- Runtime values then prefer env vars such as `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_CONTEXT_TOKENS`, `RAYA_SEARCH_*`, `RAYA_IMAGE_*`, `RAYA_RETRY_*`.
- If no API key is available, process exits before creating OpenAI client.

### OpenRouter client and conversation state

`src/index.ts` (lines 295-313, 923-996):

- `OpenAI` client is configured with OpenRouter `baseURL` and headers `HTTP-Referer` / `X-Title`.
- `messages` is an in-memory current-session array initialized with a fixed Raya system prompt.
- `askRaya()` streams `client.chat.completions.create({ model, messages, temperature: 0.7, stream: true })` with retry loop for 429/5xx/provider errors, writes chunks directly to stdout, estimates tokens locally, returns stats.

### Web search flow

`src/index.ts` (lines 470-562, 633-695):

- `searchWeb(query)` calls `https://html.duckduckgo.com/html/`, parses result HTML with regex, returns up to configured max results.
- `fetchPage(result)` fetches only `text/html` or `text/plain`, strips HTML, truncates to configured page chars; failures become snippet-only fallback.
- `formatSearchContext()` builds a system message containing fetched excerpts/source URLs.
- `addWebContext()` searches, fetches pages in parallel, prints result statuses, and appends web context into `messages`.
- `shouldAutoSearch()` triggers search for current/web-dependent English and Russian phrases.

### Clipboard/image flow

`src/index.ts` (lines 564-630, 790-893):

- Interactive paste (`Ctrl+V`) first attempts image extraction from macOS pasteboard using `osascript` JavaScript/AppKit.
- Image is saved temporarily as PNG, converted/resized to JPEG using `sips`, then base64 data URL is attached as OpenAI `image_url` content.
- If no image is available, paste falls back to `pbpaste` text.
- This is macOS-specific due to `osascript`, `sips`, and `pbpaste`.

### CLI loop and commands

`src/index.ts` (lines 698-705, 781-1081):

- `readUserInput()` uses custom raw-key interactive input for TTYs; non-TTY reads plain lines.
- Commands implemented in `main()`:
  - `/exit` exits.
  - `/model` opens model picker; `/model model-id` switches directly.
  - `/search query` explicitly fetches web context then asks using it.
- Normal messages may auto-search, then append user message and call `askRaya()`.
- On model/search answer error, the turn's newly-added messages are rolled back with `messages.splice(messagesBeforeTurn)`.
- SIGINT closes readline and exits.

### Config/docs files

- `config.example.json` (lines 1-29) mirrors `defaultConfig` without API key.
- `.env.example` (lines 1-10) lists supported env overrides.
- `README.md` (lines 36-56) documents env/config precedence; lines 114-151 document commands, image paste, web context, and runtime stats.
- `tsconfig.json` (lines 1-25) uses `NodeNext`, `strict`, `noUncheckedIndexedAccess`, emits declarations/source maps to `dist`.
- `.gitignore` (lines 1-4) ignores `node_modules/`, `dist/`, `.env`, `.DS_Store`.

## Architecture

The current repo is a minimal monolithic CLI:

1. Node launches `dist/index.js` via npm bin `raya` or runs `src/index.ts` through `tsx` in dev.
2. Startup loads env/config, ensures global config file, resolves current model/API key/settings, and initializes OpenRouter through the `openai` SDK.
3. A single process-local `messages` array is the whole conversation/session state; there is no persistence or database.
4. User input is read either through custom TTY key handling or one line at a time for non-interactive stdin.
5. Slash commands branch before model call. `/search` and auto-search inject web excerpts as system messages before the user prompt.
6. `askRaya()` streams OpenRouter chat completions to stdout and appends the assistant response only after successful completion.
7. Optional multimodal input only exists in TTY/macOS paste flow and depends on the selected OpenRouter model supporting images.

## Start Here

Open `src/index.ts` first. It contains all runtime behavior: config loading, OpenRouter client setup, web search, clipboard image handling, command parsing, input loop, streaming, retries, and stats.

## Concrete Findings

- info: `src/index.ts:1-1081` - all application logic is in one source file; no modular source structure currently exists.
- info: `package.json:15-22` - build/dev/start/typecheck scripts exist; no test script exists.
- info: no `*.test.*`, `*.spec.*`, or test directory found in the inspected repo surface.
- info: `.env` exists but is ignored and was not read to avoid exposing secrets; use `.env.example:1-10` for documented env keys.
- low: `src/index.ts:239-245` - `loadConfig()` creates `~/.raya/config.json` as a side effect on launch; notable for users expecting read-only startup.
- low: `src/index.ts:527-561` - DuckDuckGo HTML parsing is regex-based and may break if page markup changes.
- low: `src/index.ts:564-614` - clipboard image/text paste support is macOS-specific (`osascript`, `sips`, `pbpaste`).
- low: `README.md:137-141` / `src/index.ts:633-695` - web context is session-only and snippet fallback is intentionally weaker when fetch fails.

## Commands Run

- `ls .` - listed top-level files/directories.
- `find . -maxdepth/targeted patterns` - mapped repo files excluding irrelevant heavy directories where appropriate.
- `grep '^type |^const |^function |^async function |^process|^await main' src/index.ts` - extracted symbol/function map.
- `nl -ba ... | sed ...` - captured exact line ranges for cited files.
- `git status --short && npm run typecheck` - observed `.pi-subagents/` untracked before artifact write; TypeScript typecheck passed.

## Residual Risks

- `node_modules/` and full `dist/index.js` were not deeply audited; source of truth is `src/index.ts` plus `package-lock.json`.
- `.env` was deliberately not opened because it may contain a real API key.
- Running the actual CLI was not attempted because it requires API key/runtime interaction; validation was limited to static inspection and `npm run typecheck`.

## Supervisor coordination

No supervisor decision was needed.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Mapped concrete repo files and findings with exact paths/line ranges; included severity-style findings under Concrete Findings."
    }
  ],
  "changedFiles": [
    ".pi-subagents/artifacts/outputs/5828c88b-51a6-4b45-8f06-2c89da7af38b/repo-read/scout-map.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "ls .; find/grep/read targeted repo files; nl -ba selected files; git status --short && npm run typecheck",
      "result": "passed",
      "summary": "Repository mapped; typecheck completed without TypeScript errors."
    }
  ],
  "validationOutput": [
    "npm run typecheck -> tsc --noEmit completed successfully",
    "git status before artifact write showed: ?? .pi-subagents/"
  ],
  "residualRisks": [
    "node_modules and generated dist output were not deeply audited",
    ".env was not read to avoid exposing secrets",
    "CLI runtime behavior requiring API key was not executed"
  ],
  "noStagedFiles": true,
  "diffSummary": "Only required scout artifact was written; repository source files were not modified.",
  "reviewFindings": [
    "no blockers",
    "low: src/index.ts:239-245 - startup creates ~/.raya/config.json as a side effect",
    "low: src/index.ts:527-561 - DuckDuckGo HTML parsing relies on regex/markup stability",
    "low: src/index.ts:564-614 - clipboard image/text support is macOS-specific"
  ],
  "manualNotes": "No tests exist; npm run typecheck passed. BANANA"
}
```
