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
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
OPENROUTER_CONTEXT_TOKENS=128000
RAYA_SEARCH_PAGE_CHARS=6000
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
- `/quit` - quit the chat
- `/search query` - search the web, fetch linked pages, add page excerpts to the current context, and answer with sources
- `/web query` - alias for `/search`

Type `/` in interactive mode to see the command list.

## Web Context

`/search` is current-session context, not long-term memory. Raya searches the web, opens the top result pages, extracts text excerpts, and inserts those excerpts into the model context for the current conversation.

If a page blocks fetching or returns unsupported content, Raya marks it as `snippet only` and uses the search snippet as a weak fallback.

## Runtime Stats

After each answer Raya prints approximate runtime stats:

```text
stats › 18.4 tok/s · context 2.1k/128.0k (1.6%) · answer 420 tokens
```

Token counts are estimated locally, so they are useful for tracking context pressure, answer size, and speed, not exact billing.
