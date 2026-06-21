# Raya

Raya is a minimal terminal chat agent powered by OpenRouter.

Codename: Friday.

## Quick Start

```bash
npm install
cp .env.example .env
```

Add your OpenRouter API key to `.env`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemma-4-31b-it:free
OPENROUTER_CONTEXT_TOKENS=128000
RAYA_SEARCH_MAX_RESULTS=5
RAYA_SEARCH_PAGE_CHARS=6000
RAYA_SEARCH_FETCH_TIMEOUT_MS=8000
RAYA_IMAGE_MAX_DIMENSION=1280
RAYA_IMAGE_JPEG_QUALITY=80
RAYA_RETRY_ATTEMPTS=3
RAYA_RETRY_INITIAL_DELAY_MS=1200
```

For global use from any directory, put the same values in `~/.raya/.env`:

```bash
mkdir -p ~/.raya
cp .env.example ~/.raya/.env
```

Raya loads environment values in this order:

1. `.env` in the current directory
2. `~/.raya/.env`
3. `.env` next to the installed package

## Config

Raya creates `~/.raya/config.json` automatically on first launch. You can also copy the example:

```bash
mkdir -p ~/.raya
cp config.example.json ~/.raya/config.json
```

Config precedence:

1. `~/.raya/config.json`
2. `.raya/config.json` in the current workspace
3. `raya.config.json` in the current workspace
4. environment variables like `OPENROUTER_MODEL`

Example:

```json
{
  "model": "google/gemma-4-31b-it:free",
  "models": [
    "google/gemma-4-31b-it:free",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-001"
  ],
  "mode": "Chat",
  "contextTokens": 128000,
  "search": {
    "maxResults": 5,
    "pageChars": 6000,
    "fetchTimeoutMs": 8000
  },
  "images": {
    "maxDimension": 1280,
    "jpegQuality": 80
  },
  "retries": {
    "maxAttempts": 3,
    "initialDelayMs": 1200
  },
  "openrouter": {
    "baseURL": "https://openrouter.ai/api/v1",
    "referer": "https://github.com/haos/raya-agent",
    "title": "Raya"
  }
}
```

Keep `OPENROUTER_API_KEY` in `.env` unless you explicitly want to store it in config.

Run in development:

```bash
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

Install the local `raya` command:

```bash
npm link
raya
```

## Commands

- `/exit` - quit the chat
- `/search query` - search the web, fetch linked pages, add page excerpts to the current context, and answer with sources
- `/model` - open model picker
- `/model model-id` - switch to a model directly

Type `/` in interactive mode to see the command list.

## Clipboard Images

Copy an image on macOS, then paste it into Raya while writing a message:

```text
> what is on this screenshot? [Image 1]
```

Raya converts clipboard images to compressed JPEG, inserts placeholders like `[Image 1]`, `[Image 2]`, and sends them to the current OpenRouter model as multimodal input. The selected model must support images.

Images are resized before sending to avoid oversized base64 payloads and reduce provider failures.

## Web Context

`/search` is current-session context, not long-term memory. Raya searches the web, opens the top result pages, extracts text excerpts, and inserts those excerpts into the model context for the current conversation.

Raya also auto-searches when the message clearly asks for current or web-dependent information, for example latest news, current prices, weather, recent releases, or explicit requests like “найди”, “поищи”, “посмотри в интернете”.

If a page blocks fetching or returns unsupported content, Raya marks it as `snippet only` and uses the search snippet as a weak fallback.

## Runtime Stats

After each answer Raya prints approximate runtime stats:

```text
stats › 18.4 tok/s · context 2.1k/128.0k (1.6%) · answer 420 tokens
```

Token counts are estimated locally, so they are useful for tracking context pressure, answer size, and speed, not exact billing.
