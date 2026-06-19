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
OPENROUTER_MODEL=openai/gpt-4o-mini
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
