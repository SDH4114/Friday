# Technical context — `/Users/aminmammadov/giti/Friday`

Scope: as-is repository read. No future-improvement planning for Raya/pi-sdk/orchestrator. Code files were not edited; only requested artifact/progress files were written.

## Repository shape

- Project: `raya-agent` v0.1.0, ESM Node CLI (`package.json:2-8`).
- Runtime product: minimal terminal chat agent called Raya, powered by OpenRouter (`README.md:1-5`).
- Source footprint: one TypeScript source file, `src/index.ts`, containing config loading, terminal UI, web search, image clipboard handling, OpenRouter streaming, and main loop.
- Docs/config files reviewed: `README.md`, `.env.example`, `config.example.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`.
- Tests: no `*test*` or `*.spec.*` files found.
- Build output: `dist/` exists in working tree but is ignored by `.gitignore:2`; source of truth is `src/index.ts` with TypeScript build to `dist` (`tsconfig.json:8-9`).

## Package, dependencies, and commands

### Package/runtime

- `package.json:5` sets `"type": "module"`; TypeScript is configured for `NodeNext` module resolution (`tsconfig.json:4-5`).
- CLI binary is `raya -> ./dist/index.js` (`package.json:6-8`).
- Published files are restricted to `dist`, `config.example.json`, `README.md`, and `LICENSE` (`package.json:9-14`).
- Node engine is `>=20` (`package.json:41-42`). This matters because source uses global `fetch`, Web `URL`, top-level await, and modern ESM.

### Dependencies

- Runtime dependencies (`package.json:32-35`):
  - `dotenv ^16.4.7` for `.env` loading.
  - `openai ^4.77.0` as OpenAI-compatible SDK pointed at OpenRouter.
- Dev dependencies (`package.json:36-40`):
  - `typescript ^5.7.2`
  - `tsx ^4.19.2`
  - `@types/node ^22.10.2`
- `package-lock.json` confirms the same top-level dependency set and `node >=20` engine in root package metadata.

### Commands

From `package.json:15-22` and `README.md:94-111`:

- `npm run dev` — runs `tsx src/index.ts`.
- `npm run typecheck` — runs `tsc --noEmit`.
- `npm run clean` — deletes `dist`.
- `npm run build` — runs `prebuild` clean, then `tsc && chmod +x dist/index.js`.
- `npm start` — runs `node dist/index.js`.
- `npm link` then `raya` — local global CLI install.

Validation run during this read:

- `npm run typecheck` — passed.

## TypeScript/compiler constraints

`tsconfig.json:2-24` is strict:

- Target/library: ES2022 (`tsconfig.json:3,6`).
- Module/moduleResolution: NodeNext (`tsconfig.json:4-5`).
- Source root/out dir: `src` -> `dist` (`tsconfig.json:8-9`).
- Strict flags include `strict`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` (`tsconfig.json:10-17`).
- Emits declarations and source maps on build (`tsconfig.json:21-22`).
- Includes only `src/**/*.ts` (`tsconfig.json:24`).

## Configuration and environment flow

### Defaults in code

`src/index.ts:48-72` defines `RayaConfig`. `defaultConfig` at `src/index.ts:83-111` matches `config.example.json:1-29`:

- Default model: `google/gemma-4-31b-it:free`.
- Model picker candidates: Gemma free, GPT-4o-mini, Claude 3.5 Sonnet, Gemini 2.0 Flash.
- Mode: `Chat`; code also accepts `Agent` as a string, but there is no separate Agent runtime behavior beyond header display.
- Context token estimate target: `128000`.
- Search: max 5 results, 6000 page chars, 8000ms fetch timeout.
- Images: 1280 max dimension, JPEG quality 80.
- Retries: max 3 attempts, initial delay 1200ms.
- OpenRouter: base URL `https://openrouter.ai/api/v1`, referer, title.

### Environment loading

- `loadEnv()` searches exactly one file and stops on first found path (`src/index.ts:142-159`):
  1. `${process.cwd()}/.env`
  2. `~/.raya/.env`
  3. package root `.env`
- It calls `dotenv.config({ override: false })` (`src/index.ts:154`), so already-set process env wins over file values.
- README documents this env precedence (`README.md:36-40`).
- `.env.example:1-10` lists supported env vars:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
  - `OPENROUTER_CONTEXT_TOKENS`
  - `RAYA_SEARCH_MAX_RESULTS`
  - `RAYA_SEARCH_PAGE_CHARS`
  - `RAYA_SEARCH_FETCH_TIMEOUT_MS`
  - `RAYA_IMAGE_MAX_DIMENSION`
  - `RAYA_IMAGE_JPEG_QUALITY`
  - `RAYA_RETRY_ATTEMPTS`
  - `RAYA_RETRY_INITIAL_DELAY_MS`

### Config files

- `ensureGlobalConfig()` creates `~/.raya/config.json` with defaults and mode `0o600` if missing (`src/index.ts:230-237`).
- `loadConfig()` then reads/merges configs in order (`src/index.ts:239-263`):
  1. `~/.raya/config.json`
  2. `${cwd}/.raya/config.json`
  3. `${cwd}/raya.config.json`
- Later configs merge over earlier configs through `mergeConfig()` (`src/index.ts:182-223`). Invalid JSON/config read exits process with code 1 (`src/index.ts:252-260`).
- README documents config precedence as global, workspace `.raya/config.json`, workspace `raya.config.json`, then env vars (`README.md:51-56`). Code reflects this because env values are applied after config load (`src/index.ts:266-280`).
- API key can come from env or `config.openrouter.apiKey`; missing key exits with instructions (`src/index.ts:268,287-293`). README recommends keeping the key in `.env` (`README.md:92`).

### Important config nuance

- Numeric environment values are converted with `Number(...)` directly (`src/index.ts:270,274-280`) and are not validated for `NaN`, zero, or negative values. Config-file numeric values are validated as finite positive numbers via `optionalNumber()` (`src/index.ts:169-170`).

## Source architecture layers

Although implemented in a single file, the as-is code separates into these functional layers:

1. **Type/domain definitions** — chat messages, search results/pages, responses, image attachments, config (`src/index.ts:16-77`).
2. **Static defaults/theme/path utilities** — defaults, terminal color theme, path formatter (`src/index.ts:83-140`).
3. **Config/env loading** — env file discovery, JSON config merge, global config creation (`src/index.ts:142-280`).
4. **OpenRouter client setup and conversation state** — API key validation, OpenAI-compatible client, initial system prompt, readline setup (`src/index.ts:287-313`).
5. **Terminal rendering and errors** — header, errors, status formatting (`src/index.ts:315-367`).
6. **Retry/token/stat helpers** — retryable status detection, local token estimation, runtime stats (`src/index.ts:370-468`).
7. **Web search/context layer** — DuckDuckGo HTML search, page fetch/strip, search context injection (`src/index.ts:470-562`, `633-695`).
8. **Clipboard/image layer** — macOS image extraction via `osascript`, JPEG conversion via `sips`, text fallback via `pbpaste` (`src/index.ts:564-614`, used by interactive paste handling at `810-833`).
9. **Input/command UI layer** — non-interactive and raw TTY input, `/` command suggestions, `/model` picker (`src/index.ts:698-893`).
10. **Model streaming layer** — OpenRouter streaming chat completion with retry/backoff (`src/index.ts:895-996`).
11. **Main runtime loop** — dispatch `/exit`, `/model`, `/search`, auto-search, append messages, call model, rollback failed turn (`src/index.ts:998-1081`).

## Runtime flow

1. Module loads with top-level await (`src/index.ts:1081`).
2. Resolve `__dirname`/`packageRoot` from ESM URL (`src/index.ts:79-80`).
3. Load first existing `.env` path (`src/index.ts:142-159`, called at `266`).
4. Ensure/read/merge config files (`src/index.ts:230-263`, called at `267`).
5. Derive effective runtime values from env over config (`src/index.ts:268-280`).
6. If no API key, print error and exit (`src/index.ts:287-293`).
7. Construct OpenAI SDK client pointed to OpenRouter with `HTTP-Referer` and `X-Title` headers (`src/index.ts:295-302`).
8. Seed `messages` with system prompt (`src/index.ts:304-310`).
9. Create readline interface and optional async iterator for piped/non-TTY mode (`src/index.ts:312-313`).
10. `main()` prints header (`src/index.ts:998-999`).
11. For every user turn (`src/index.ts:1001-1069`):
    - Read interactive raw TTY input or non-interactive line (`src/index.ts:781-893`).
    - Empty turns are skipped; `/exit` breaks (`src/index.ts:1008-1015`).
    - `/model` switches model directly or through picker (`src/index.ts:1018-1024`, `698-745`).
    - `/search query` performs search, fetches pages, adds system web context, then asks model to answer from context (`src/index.ts:1027-1044`).
    - Normal messages can trigger auto-search if no image attachments and text matches current/web-dependent patterns (`src/index.ts:1045-1055`, patterns at `661-678`).
    - User message is pushed as plain text or multimodal content (`src/index.ts:616-630`).
    - `askRaya()` streams the assistant answer, appends assistant message, and prints stats (`src/index.ts:923-996`, `1060-1063`).
    - On model error, messages added during the turn are removed with `messages.splice(messagesBeforeTurn)` (`src/index.ts:1064-1067`).
12. EOF or `/exit` closes readline and prints `Bye.` (`src/index.ts:1071-1072`). SIGINT also closes and exits (`src/index.ts:1075-1079`).

## Commands/features as implemented

### `/exit`

- Case-insensitive exact match after trim (`src/index.ts:1014-1015`).

### `/model` and `/model model-id`

- Regex parsed at `src/index.ts:1019-1020`.
- Direct argument sets `currentModel` without validation against OpenRouter (`src/index.ts:698-705`).
- Picker lists unique `[currentModel, ...config.models]`, supports numeric selection and `c` for custom id (`src/index.ts:708-745`).

### `/search query`

- Parsed by `^/search\s+(.+)` (`src/index.ts:1019`).
- Searches DuckDuckGo HTML endpoint (`src/index.ts:527-536`).
- Extracts result blocks using regex over returned HTML (`src/index.ts:542-561`).
- Fetches each result page concurrently (`src/index.ts:523-524`) with timeout and text/html or text/plain content-type requirement (`src/index.ts:482-520`).
- Strips basic HTML tags/scripts/styles/nav/footer/header (`src/index.ts:470-479`).
- Adds a system message containing fetched excerpts or snippet fallback (`src/index.ts:633-645`, pushed at `693`).
- For `/search`, adds user message: `Using the fetched web page context above...` (`src/index.ts:1035-1039`).

### Auto-search

- Skips commands (`src/index.ts:664-665`).
- Trigger patterns cover English current/latest/search terms, years `2025-2029`, and Russian current/search terms (`src/index.ts:668-675`).
- Auto-search only runs when there are no image attachments (`src/index.ts:1046`).
- If auto-search fails, it logs an error but still sends the original message to the model (`src/index.ts:1047-1055`).

### Clipboard image/multimodal input

- Interactive raw TTY mode watches keypresses; Ctrl+V first tries image extraction, then falls back to text paste (`src/index.ts:873-875`, `824-833`).
- Image extraction is macOS-specific:
  - `osascript -l JavaScript` with AppKit reads image from pasteboard and writes PNG (`src/index.ts:568-591`).
  - `sips` resizes/converts to JPEG (`src/index.ts:592-596`).
  - JPEG is read as base64 data URL (`src/index.ts:597-598`).
- Attachments are referenced by placeholders like `[Image 1]`; only attachments whose placeholders remain in the buffer are sent (`src/index.ts:813-817`, `853-857`).
- Multimodal message content uses OpenAI SDK `image_url` parts (`src/index.ts:621-629`).

### Streaming/retries/stats

- `askRaya()` estimates input tokens locally before sending (`src/index.ts:923-926`).
- Calls `client.chat.completions.create({ model, messages, temperature: 0.7, stream: true })` (`src/index.ts:933-940`).
- Retries only pre-stream create failures that are retryable by status/message (`src/index.ts:370-375`, `933-948`).
- Streams chunks to stdout as they arrive (`src/index.ts:955-970`).
- Prints stats using local char/4 token estimate, context pressure, output tokens, and output tokens/sec (`src/index.ts:436-468`). README warns counts are approximate, not billing exact (`README.md:143-151`).

## External services and OS assumptions

- OpenRouter API via OpenAI-compatible SDK (`src/index.ts:295-302`).
- DuckDuckGo HTML search endpoint: `https://html.duckduckgo.com/html/` (`src/index.ts:527-529`).
- Page fetching uses Node global `fetch` and user agent `Raya/0.1` (`src/index.ts:482-493`).
- Clipboard image/text features assume macOS CLI tools and APIs: `osascript`, AppKit, `sips`, `pbpaste` (`src/index.ts:564-614`). Non-macOS interactive paste may silently fall back/fail for image; text paste depends on `pbpaste` in fallback path.

## Documentation alignment

- README quick start, env variables, global env, config precedence, commands, clipboard images, web context, and stats align with code at a high level (`README.md:7-151`).
- README says config precedence includes environment variables last (`README.md:51-56`); code applies env after config (`src/index.ts:266-280`).
- README says `/search` is current-session context, not long-term memory (`README.md:135-141`); code stores search context in in-memory `messages` only (`src/index.ts:304-310`, `680-695`).
- Header displays `Memory: Disabled` and `MCP: Disconnected` as constants (`src/index.ts:272-273`, printed at `325-326`). There is no memory or MCP implementation in source.

## Test/validation surface

- No test files found via repository search for `**/*test*` and `**/*.spec.*`.
- Available validation is TypeScript typecheck: `npm run typecheck` (`package.json:21`) — passed in this run.
- Build validation (`npm run build`) would rewrite `dist/` because `prebuild` deletes it and `tsc` emits new files (`package.json:16-19`); not run because task says not to change repository content.
- Runtime validation of OpenRouter behavior requires a valid `OPENROUTER_API_KEY` and network access; not run.
- Runtime validation of `/search` requires network access and DuckDuckGo HTML shape; not run beyond source inspection.
- Clipboard image validation requires macOS clipboard image plus `osascript`/`sips`; not run.

## Findings and risks (as-is understanding)

Severity labels reflect understanding/operational risk, not necessarily requested changes.

1. **medium: `src/index.ts:230-246` — first launch writes outside the repo to `~/.raya/config.json`.**  
   The CLI has a startup side effect before any interaction: if global config is missing, it creates it. This is documented in README (`README.md:44-49`) but matters for tests/sandboxing and for “read-only” executions of the binary.

2. **medium: `src/index.ts:564-614` — clipboard image path is macOS-specific.**  
   Image paste uses AppKit through `osascript`, `sips`, and `pbpaste`. README explicitly frames clipboard images as macOS (`README.md:123-125`). On other OSes image paste is not portable as-is.

3. **medium: `src/index.ts:527-561` — search parsing depends on DuckDuckGo HTML markup.**  
   Search result extraction is regex-based over HTML classes such as `result__a` and `result__snippet`. If DuckDuckGo markup changes or blocks the request, `/search`/auto-search can return no results or fail.

4. **medium: `src/index.ts:270,274-280` — env numeric overrides are not validated.**  
   Config JSON values are constrained by `optionalNumber()` (`src/index.ts:169-170`), but environment values go through `Number(...)` directly. Invalid env values can produce `NaN` or unexpected runtime behavior for context tokens, search limits, timeouts, image conversion, or retries.

5. **low: `src/index.ts:91,191,271,323` — `mode: "Agent"` is accepted/displayed but has no runtime branch.**  
   `mode` changes header text only. No Agent-specific execution path exists in `main()`.

6. **low: `src/index.ts:436-468` — token accounting is approximate.**  
   It uses `Math.ceil(text.length / 4)` and includes role/content text, not provider tokenization. README documents this as approximate (`README.md:151`).

7. **low: repository has no automated tests.**  
   Only typecheck is available from scripts. This limits confidence for behavior such as raw TTY input, search parsing, rollback, and multimodal message shape.

## High-value file map

- `src/index.ts:1-14` — shebang/imports; Node/OpenAI/dotenv/readline/fs/os/path/process utilities.
- `src/index.ts:48-72` — config schema.
- `src/index.ts:83-111` — default config.
- `src/index.ts:142-159` — `.env` discovery and loading.
- `src/index.ts:182-223` — config merge rules.
- `src/index.ts:230-263` — global config creation and config load order.
- `src/index.ts:266-302` — effective runtime values, API key check, OpenRouter client.
- `src/index.ts:304-313` — in-memory message state and readline setup.
- `src/index.ts:470-562` — page fetch/search implementation.
- `src/index.ts:564-630` — clipboard image/text and multimodal user message creation.
- `src/index.ts:633-695` — web context formatting/injection and auto/manual search support.
- `src/index.ts:698-745` — model picker/direct switch.
- `src/index.ts:781-893` — interactive/non-interactive input loop.
- `src/index.ts:923-996` — OpenRouter streaming/retry.
- `src/index.ts:998-1081` — main loop and SIGINT handling.
- `package.json:15-22` — command surface.
- `tsconfig.json:2-24` — strict TypeScript/build constraints.
- `README.md:36-56` — env/config precedence docs.
- `README.md:114-151` — user-facing commands, web context, stats.
- `.env.example:1-10` — supported env variables.
- `config.example.json:1-29` — sample full config.
- `.gitignore:1-4` — ignores `node_modules`, `dist`, `.env`, `.DS_Store`.

## Meta-handoff for a next agent

Goal: Use this as-is technical map of the Friday/Raya repository. Do not plan improvements to Raya/pi-sdk/orchestrator unless explicitly asked; source architecture is a single-file Node TypeScript CLI.

Context/evidence:

- Package: ESM CLI, Node >=20, `raya` binary points to `dist/index.js`, scripts in `package.json:15-22`.
- Runtime: load env, create/merge config, validate API key, initialize OpenRouter client, then interactive/non-interactive terminal loop.
- Main source is `src/index.ts`; no internal modules or tests exist.
- External integrations: OpenRouter via `openai` SDK, DuckDuckGo HTML search, macOS clipboard tools.
- Validation available without side effects: `npm run typecheck`; it passed.

Success criteria for downstream work:

- Preserve NodeNext/ESM/strict TypeScript constraints if editing is later requested.
- Account for startup side effects (`~/.raya/config.json`) when running the CLI.
- Avoid build unless dist rewrites are acceptable; `npm run build` deletes/recreates `dist`.
- For review-only tasks, use file/line evidence above and do not infer unimplemented subsystems from labels like Memory/MCP/Agent.

Suggested validation:

- First-line validation: `npm run typecheck`.
- Optional when edits affect emitted CLI: `npm run build` only if changing `dist` is allowed.
- Runtime smoke test requires `OPENROUTER_API_KEY`; search/image behavior requires network/macOS prerequisites.

Stop/escalation rules:

- Ask for decision if asked to validate live OpenRouter calls without credentials, to run commands that rewrite `dist`, or to test clipboard/image features on a non-macOS environment.
- Enough evidence for repo-level context has been gathered: package/config/docs/full source/test search/typecheck.

Resolved assumptions:

- `dist/` is generated/ignored, not the source of truth.
- `.env` may contain secrets and was not read; `.env.example` was used for environment surface.
- Artifact/progress writes are allowed by the task despite “do not change” applying to repository source/config docs/tests.
