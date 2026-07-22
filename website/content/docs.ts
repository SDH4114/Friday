export type DocBlock =
  | { type: "p"; text: string }
  | { type: "code"; code: string; language?: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; tone: "note" | "tip" | "warning" | "security" | "limitation"; title: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type DocSection = { id: string; title: string; blocks: DocBlock[] };
export type DocPage = { slug: string; title: string; description: string; sections: DocSection[] };

const p = (text: string): DocBlock => ({ type: "p", text });
const code = (value: string, language = "bash"): DocBlock => ({ type: "code", code: value, language });
const list = (...items: string[]): DocBlock => ({ type: "list", items });
const callout = (tone: Extract<DocBlock, { type: "callout" }>["tone"], title: string, text: string): DocBlock => ({ type: "callout", tone, title, text });
const table = (headers: string[], rows: string[][]): DocBlock => ({ type: "table", headers, rows });

export const docs: DocPage[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Go from a clean terminal to your first Plan and Build session.",
    sections: [
      { id: "prerequisites", title: "Prerequisites", blocks: [p("Raya currently supports macOS and Linux and requires Node.js 22 or newer. The installer can install Node through nvm when needed."), callout("note", "Provider setup is optional", "The first run lets you skip provider setup. Connect one later with raya login, or register a local OpenAI-compatible endpoint.")] },
      { id: "install", title: "1. Install Raya", blocks: [code("curl -fsSL https://raw.githubusercontent.com/SDH4114/Raya-APPLE/prime/install.sh | bash"), p("The GitHub-source installer clones the prime branch into a temporary directory, builds a package tarball, installs it globally, syncs built-in skills, creates ~/.raya/SOUL.md with Raya's default character when it is missing, and removes the temporary checkout.")] },
      { id: "first-run", title: "2. Start the first session", blocks: [code("raya"), p("Choose a provider, or press Enter to continue without one. When connected, open Raya in the project directory you want it to understand."), code("cd ~/projects/my-app\nraya\n\n[Plan] > map this project and explain its architecture", "text")] },
      { id: "plan-build", title: "3. Plan, then Build", blocks: [p("Raya begins in Plan by default. Review the investigation, press Tab to switch the current session to Build, then ask for a focused implementation."), code("[Build] > implement the first step and run the relevant tests", "text"), callout("security", "Review consequential work", "Standard security asks before consequential Build actions. Full mode removes that prompt but does not turn Raya into a sandbox.")] },
      { id: "explore", title: "4. Explore the environment", blocks: [code("/sessions\n/skills\n/mcps\n/security\n/about", "text"), p("Use /sessions for workspace-bound conversations, /skills to attach reusable instructions, /mcps to inspect connected servers, and /about for the runtime capability map.")] }
    ]
  },
  {
    slug: "installation",
    title: "Installation",
    description: "Install Raya from GitHub, build it for development, and troubleshoot PATH.",
    sections: [
      { id: "supported-platforms", title: "Supported platforms", blocks: [table(["Platform", "Status", "Requirement"], [["macOS", "Supported", "Node.js 22+"], ["Linux", "Supported", "Node.js 22+"], ["Windows", "Not supported", "Planned; use is not documented as working"]])] },
      { id: "installer", title: "GitHub installer", blocks: [code("curl -fsSL https://raw.githubusercontent.com/SDH4114/Raya-APPLE/prime/install.sh | bash"), p("The installer checks the OS, installs Node 22 through nvm if necessary, clones the repository, runs npm ci and npm run build, packs the package, and installs the tarball globally. It also creates ~/.raya/SOUL.md with the default character when absent, without overwriting an existing file. Packaging avoids a global symlink into the temporary clone."), callout("note", "npm publication", "The source currently documents the npm package name @sdh4114/raya, but GitHub remains the working pre-publication install path.")] },
      { id: "development", title: "Development install", blocks: [code("git clone https://github.com/SDH4114/Raya-APPLE.git\ncd Raya-APPLE\nnpm install\nnpm run build\nnpm link\nraya") ] },
      { id: "update", title: "Update, backup, and uninstall", blocks: [p("raya update checks the current commit on GitHub, compares its version with the local executable, and asks for explicit confirmation before running the official installer. It does not replace your ~/.raya state."), code("raya update\nraya backup --setup\nraya backup\nraya backup --list\nraya backup --restore <reference>\nraya uninstall"), p("Every local version is stored as one flat ~/raya-backups/<name>/ folder containing Raya source, an installable archive, and all of RAYA_HOME. GitHub snapshots commit only .raya-backup, exclude .env and auth.json, and use a temporary clone that is deleted after each operation; use a private repository because remaining state may still be personal."), callout("warning", "Complete local removal", "raya uninstall requires typing UNINSTALL, removes the global package, launchers, RAYA_HOME, and local backups. Add --keep-backups to preserve backup history. Developer source repositories, Node.js, and remote GitHub repositories are not removed.")] },
      { id: "path", title: "PATH troubleshooting", blocks: [code("command -v raya\nnpm prefix -g"), p("The installer tries to place a launcher in a writable PATH entry. If none is available, it creates ~/.local/bin/raya and adds ~/.local/bin to existing zsh or bash startup files. Open a new terminal or export that directory for the current shell.")] }
    ]
  },
  {
    slug: "cli",
    title: "CLI and terminal UI",
    description: "Interactive sessions, one-shot prompts, attachments, history, and direct commands.",
    sections: [
      { id: "entrypoints", title: "Ways to run Raya", blocks: [code("raya                         # interactive TUI\nraya \"explain this repository\" # one-shot request\nraya web                     # localhost Web app\nraya gateway --start         # Telegram gateway"), p("The same agent assembly supports these interfaces. Provider, model, tools, MCP runtime, and persistent state come from the same Raya configuration.")] },
      { id: "input", title: "Input and attachments", blocks: [list("Type @ to choose workspace files or folders; selections become @file or @folder markers.", "Paste images to create numbered image attachments when the selected model supports them.", "Shift+Enter inserts a real newline. Enter submits or selects a menu item.", "Outside menus, Up and Down move through submitted prompt history for single-line input.", "Start a line with ! to execute it directly without sending it to the model or storing it in the conversation."), callout("security", "Direct shell is direct", "A ! command runs with your operating-system permissions. It is an explicit local terminal action, not an agent request.")] },
      { id: "hotkeys", title: "Default hotkeys", blocks: [table(["Action", "Default", "Purpose"], [["toggleMode", "Tab", "Switch Plan / Build for this session"], ["cancel", "Escape", "Close a menu or cancel the active run"], ["exit", "Ctrl+C", "Exit Raya"], ["clearScreen", "Ctrl+L", "Clear terminal scrollback"]]), code("raya config --hotkey toggleMode=ctrl+m\nraya config --reset-hotkeys") ] },
      { id: "rendering", title: "Readable work output", blocks: [p("Answers render Markdown in the terminal. Tool activity appears in compact panels; writes show unified diffs and shell activity shows command, output, and exit code. The footer keeps context usage, model, reasoning level, working directory, and Raya version visible.")] },
      { id: "shortcuts", title: "Direct shortcuts", blocks: [code("raya yt                    # opens YouTube\nraya yt terminal agents    # searches YouTube\nraya search Model Context Protocol\nraya git\nraya open Safari"), p("raya serach is kept as an alias for raya search. The git shortcut stages all changes, asks for a commit message, commits, and pushes; review the working tree before invoking it.")] }
    ]
  },
  {
    slug: "configuration",
    title: "Configuration",
    description: "Validated settings, separate secrets, and the RAYA_HOME state boundary.",
    sections: [
      { id: "home", title: "RAYA_HOME", blocks: [p("Raya stores state under ~/.raya by default. Set RAYA_HOME before launching Raya to isolate or relocate the complete state directory."), code("export RAYA_HOME=/path/to/raya-state\nraya status"), list("config.json — validated non-secret settings, including backup mode and path", ".env — owner-only provider and Telegram secrets plus RAYA_BACKUP_TARGET", "SOUL.md — user-owned Raya personality", "sessions.json and memory/sessions/ — conversation state and transcripts", "USER.md and MEMORY.md — durable memory", "commands.json, scheduled.json, web.json — feature-specific stores", "skills/ and plugins/ — installed extensions")] },
      { id: "backups", title: "Backups and rollback", blocks: [code("raya backup --setup                    # interactive local/GitHub choice\nraya backup --local \"before-upgrade\"   # local setup plus named backup\nraya backup --github <private-repo-url> # explicit GitHub setup\nraya backup                            # create a named version\nraya backup --list\nraya backup --restore <reference>       # always asks GitHub or Local"), p("Each local version is an independent ~/raya-backups/<name>/ folder. Code, .raya, manifest.json, and raya-package.tgz are stored directly inside it, with no date folder, snapshot wrapper, or local Git repository. Later backups are sibling folders and duplicate names are rejected. --list prints separate GitHub and Local sections with names, Raya versions, creation dates, and restore commands. Old nested local snapshots remain restorable."), p("Restore always asks which source to use, then requires typing RESTORE. GitHub credentials are handled by Git itself; Raya stores the exact target owner-only in .env, keeps credential files out of Git commits, and deletes its temporary checkout after create, list, or restore."), callout("security", "Remote state is sensitive", "Use a private repository. GitHub mode excludes .env and auth.json, but sessions, memory, SOUL.md, and configuration can still contain personal information.")] },
      { id: "backup-layout", title: "Exact backup layout", blocks: [code("~/raya-backups/\n├── before-upgrade/\n│   ├── .raya/\n│   ├── src/\n│   ├── builtin-skills/\n│   ├── package.json\n│   ├── manifest.json\n│   └── raya-package.tgz\n└── after-upgrade/\n    ├── .raya/\n    ├── src/\n    ├── builtin-skills/\n    ├── package.json\n    ├── manifest.json\n    └── raya-package.tgz", "text"), p("The source keeps its normal internal folders, but Raya adds no timestamp directory and no snapshot, snapshots, backups, raya-source, raya-home, or .git wrapper. A duplicate name is rejected, and an incomplete named folder is removed if creation fails."), table(["Operation", "Local", "GitHub"], [["Create", "Writes ~/raya-backups/<name> directly", "Clones temporarily, commits .raya-backup, pushes, deletes clone"], ["List", "Scans named folders under ~/raya-backups", "Clones temporarily and reads remote commit manifests"], ["Restore", "Reads the chosen named folder", "Checks out the chosen remote commit temporarily"], ["Secrets", "Includes complete .raya state", "Excludes .env and auth.json"]])] },
      { id: "common", title: "Common changes", blocks: [code("raya config --provider openai-codex --model gpt-5.4\nraya config --mode plan --thinking medium\nraya config --security standard\nraya config --theme ocean --design small"), p("The CLI updates only requested fields. Unknown keys in a valid config object are preserved for forward compatibility.")] },
      { id: "command-policy", title: "Shell command policy", blocks: [code('{\n  "autoApproveCommands": ["npm test", "git status"],\n  "blockedCommands": ["rm", "rm -rf"]\n}', "json"), callout("security", "Defense in depth", "Blocked prefixes are checked across common wrappers and chains, but a deny-list is not an operating-system sandbox.")] },
      { id: "invalid-json", title: "Malformed configuration", blocks: [p("Raya validates stored JSON before use. Keep secrets out of config.json. If you edit the file manually, preserve a top-level JSON object and use the documented fields from the configuration reference.")] }
    ]
  },
  {
    slug: "providers",
    title: "Providers and models",
    description: "Connect OAuth or API-key providers and select a model without coupling Raya to one vendor.",
    sections: [
      { id: "types", title: "Provider types", blocks: [table(["Type", "Examples", "Credential"], [["OAuth", "OpenAI Codex", "ChatGPT Plus / Pro / Codex OAuth"], ["API key", "OpenAI API, Moonshot AI, Anthropic, OpenRouter, OpenCode Zen, Hugging Face", "Provider-specific key or token"], ["Local OpenAI-compatible", "Ollama, LM Studio, vLLM, llama.cpp", "Keyless by default"]])] },
      { id: "connect", title: "Connect and inspect", blocks: [code("raya login\nraya login openai      # API key: GPT-5.6 family\nraya login moonshotai  # API key: Kimi K3\nraya providers\nraya models --provider openai\nraya status\nraya logout openai"), p("The interactive /providers menu can connect or update credentials and select a provider. /models lists models across configured providers.")] },
      { id: "latest-models", title: "GPT-5.6 and Kimi K3", blocks: [p("The direct OpenAI API catalog includes gpt-5.6 (the Sol alias), gpt-5.6-sol, gpt-5.6-terra, and gpt-5.6-luna. OpenAI Codex OAuth also lists gpt-5.6-sol, gpt-5.6-terra, and gpt-5.6-luna when they are available to the connected account. The Moonshot AI catalog includes kimi-k3. These entries retain their provider-specific context, image, reasoning, output-limit, and token-cost metadata."), code("raya config --provider openai --model gpt-5.6\nraya config --provider openai-codex --model gpt-5.6-sol\nraya config --provider moonshotai --model kimi-k3") ] },
      { id: "model-settings", title: "Model settings", blocks: [p("After you choose a model in /models, Raya reads that model's provider metadata and immediately opens a second picker containing only its supported reasoning levels. This includes max where the provider exposes it. /thinking uses the same model-specific list, and incompatible stored levels are corrected when a model or session is loaded. Raya also records context window and maximum output tokens."), callout("limitation", "Reasoning is not orchestration", "The selected model provides reasoning. Raya supplies system context, tools, skills, memory, sessions, approvals, and interfaces.")] }
    ]
  },
  {
    slug: "local-models",
    title: "Local models",
    description: "Register an already-running OpenAI-compatible endpoint.",
    sections: [
      { id: "lifecycle", title: "What Raya does", blocks: [p("Raya registers and calls local OpenAI-compatible chat-completions endpoints. It does not download a model or start Ollama, LM Studio, vLLM, or llama.cpp for you."), callout("warning", "Start the server first", "Confirm the endpoint and exact model ID in the local runtime before adding it to Raya.")] },
      { id: "ollama", title: "Ollama", blocks: [code("ollama pull qwen3:8b\nraya local add qwen3:8b\nraya config --provider ollama --model qwen3:8b"), p("Ollama defaults to http://127.0.0.1:11434/v1.")] },
      { id: "other", title: "LM Studio, vLLM, and llama.cpp", blocks: [code("raya local add local-model-id \\\n  --provider lmstudio \\\n  --base-url http://127.0.0.1:1234/v1 \\\n  --name \"My LM Studio model\"\n\nraya local add Qwen/Qwen3-Coder-30B-A3B-Instruct \\\n  --provider vllm \\\n  --base-url http://127.0.0.1:8000/v1 \\\n  --context-window 131072 \\\n  --max-tokens 16384") ] },
      { id: "manage", title: "Manage entries", blocks: [code("raya local list\nraya local remove qwen3:8b --provider ollama"), callout("limitation", "Capability varies", "A server may answer normal chat but still lack reliable tool calling or vision. That is a model/runtime capability, not an automatic Raya guarantee.")] }
    ]
  },
  {
    slug: "plan-build",
    title: "Plan and Build",
    description: "Use investigation and mutation as two explicit phases of work.",
    sections: [
      { id: "plan", title: "Plan", blocks: [p("Plan is investigation-oriented. Raya can inspect workspace files, search public web text, read sessions and memory, load skills, and use read-only MCP tools. Common mutating shell operations are restricted."), code("[Plan] > trace how authentication reaches the provider runtime and propose a safe change", "text")] },
      { id: "build", title: "Build", blocks: [p("Build exposes file writing, application control, and skill authoring in addition to the read-oriented toolset. Standard security requests approval for consequential actions; Full skips that interactive prompt."), code("[Build] > implement the approved change, run focused tests, and show the diff", "text")] },
      { id: "session-state", title: "Mode belongs to the session", blocks: [p("Tab changes the active session mode without discarding the current input. Each saved session restores its own Plan or Build mode. Theme remains a global preference."), callout("security", "Mode is not a sandbox", "Plan reduces mutation opportunities, but Raya still runs on your machine with your user permissions. Work only in trusted directories.")] }
    ]
  },
  {
    slug: "tools",
    title: "Built-in tools",
    description: "The executable capabilities exposed through the RayaTool contract.",
    sections: [
      { id: "catalog", title: "Tool catalog", blocks: [table(["Tool", "Capability", "Mode"], [["list_files", "List paths under the workspace", "Plan + Build"], ["read_file", "Read workspace files", "Plan + Build"], ["shell", "Run bounded shell commands with policy checks", "Plan restricted; Build normal"], ["web", "DuckDuckGo text search and public URL fetch", "Plan + Build"], ["memory", "Update USER.md or MEMORY.md", "Plan + Build"], ["sessions", "List, search, and read saved sessions", "Plan + Build"], ["schedule", "Create, list, or cancel reminders", "Plan + Build"], ["use_skill", "Load full skill instructions", "Plan + Build"], ["subagent", "Delegate one bounded task with inherited context and policy", "Plan + Build"], ["write_file", "Create or replace a workspace file and produce a diff", "Build"], ["app_control", "Open or close desktop applications", "Build"], ["create_skill", "Write a reusable skill with approval", "Build"]])] },
      { id: "boundaries", title: "Capability boundaries", blocks: [p("Workspace file operations resolve real paths and reject escapes beyond the active workspace. The web tool blocks local and private network targets. Shell output and duration are bounded by configuration."), callout("security", "Tools execute locally", "Tool checks reduce accidents; they do not create process, filesystem, or network isolation.")] },
      { id: "extensions", title: "Extended tools", blocks: [p("Connected MCP servers add namespaced executable tools plus resource and prompt adapters. The subagent tool is assembled separately so a delegated agent inherits the current model, mode, workspace policy, and MCP runtime.")] }
    ]
  },
  {
    slug: "mcp",
    title: "MCP",
    description: "Extend Raya with stdio, Streamable HTTP, and legacy SSE servers.",
    sections: [
      { id: "stdio", title: "Add a stdio server", blocks: [code("raya mcp add filesystem \\\n  --command npx \\\n  --arg=-y \\\n  --arg @modelcontextprotocol/server-filesystem \\\n  --arg \"$PWD\"\nraya mcp test filesystem") ] },
      { id: "remote", title: "Add an HTTP or SSE server", blocks: [code("export MY_MCP_TOKEN=\"...\"\nraya mcp add company \\\n  --url https://mcp.example.com/mcp \\\n  --header 'Authorization=Bearer ${MY_MCP_TOKEN}'\n\nraya mcp add legacy \\\n  --url https://mcp.example.com/sse \\\n  --transport sse"), p("Environment placeholders are expanded at connection time in commands, arguments, paths, environment values, URLs, and headers.")] },
      { id: "manage", title: "Manage and test", blocks: [code("raya mcp list\nraya mcp test filesystem\nraya mcp disable filesystem\nraya mcp enable filesystem\nraya mcp remove filesystem"), p("Enabled servers connect once when the host starts and close on teardown. One unavailable optional server is reported without preventing the others from starting; the test command is intentionally strict.")] },
      { id: "capabilities", title: "Tools, resources, and prompts", blocks: [p("Tool names are collision-safe, for example mcp_filesystem_read_file. Resources and prompts are exposed through mcp_list_resources, mcp_read_resource, mcp_list_prompts, and mcp_get_prompt."), callout("security", "External trust boundary", "Plan permits only tools the server marks read-only. In Standard Build, other tools follow the server approval policy: always, writes, or never. MCP annotations are external claims, not proof of safety.")] }
    ]
  },
  {
    slug: "skills",
    title: "Skills",
    description: "Progressively loaded instructions for repeatable workflows.",
    sections: [
      { id: "sources", title: "Skill sources", blocks: [list("Built-in skills packaged with Raya", "User skills under ~/.raya/skills/<name>/SKILL.md", "Workspace skills under .agents/skills/<name>/SKILL.md", "Skills contributed by supported Pi packages"), p("Only a compact catalog is added at session start. The use_skill tool loads full instructions and referenced resources when they become relevant.")] },
      { id: "attach", title: "Attach a skill", blocks: [p("Open /skills and choose a skill. Raya inserts an @skill:<name> marker into the current input. Repeat the picker to attach more than one skill before submitting."), code("@skill:debugging @skill:implementation fix this failure", "text")] },
      { id: "sync", title: "Synchronize built-ins", blocks: [code("raya skills list\nraya skills sync\nraya skills sync --force"), p("Normal sync installs only missing built-ins and preserves user edits. --force deliberately replaces installed built-in folders with packaged versions.")] },
      { id: "author", title: "Create a skill", blocks: [p("In Build mode, create_skill can write a persistent skill when you explicitly ask Raya to teach itself a reusable workflow. Standard security asks before the write."), callout("note", "Instructions, not permissions", "A skill changes context and procedure. It does not execute code, add an operating-system permission, or bypass Plan, Build, or approval rules.")] }
    ]
  },
  {
    slug: "sessions",
    title: "Sessions",
    description: "Workspace-bound conversation state with readable transcripts.",
    sections: [
      { id: "storage", title: "What a session stores", blocks: [p("Structured state lives in ~/.raya/sessions.json. Each saved session also receives a Markdown transcript under ~/.raya/memory/sessions/YYYY-MM-DD/<session-id>.md."), list("Conversation messages", "Canonical workspace binding", "Readable name derived from the first prompt", "Per-session Plan or Build mode", "Provider/model configuration snapshot")] },
      { id: "lifecycle", title: "Lifecycle", blocks: [p("A normal raya launch begins with a transient empty session bound to the current directory. It is persisted only after the first message. /sessions shows only sessions for that workspace."), code("/sessions new\n/sessions open <id>\n/sessions delete <id>", "text"), p("In the picker, dd requests deletion and then opens confirmation.")] },
      { id: "difference", title: "Sessions are not memory", blocks: [callout("note", "Two kinds of continuity", "Sessions preserve conversation state. USER.md and MEMORY.md preserve compact durable facts that can be useful across sessions.")] }
    ]
  },
  {
    slug: "memory",
    title: "Durable memory",
    description: "Compact, user-owned facts across sessions—not an unlimited transcript.",
    sections: [
      { id: "files", title: "Memory files", blocks: [table(["File", "Purpose", "Prompt snapshot limit"], [["USER.md", "Preferences and durable user facts", "1,375 characters"], ["MEMORY.md", "Project decisions and reusable lessons", "2,200 characters"]]), p("The memory tool can add, replace, or remove durable entries. Changes are persisted immediately and become available to later sessions.")] },
      { id: "good-memory", title: "What belongs in memory", blocks: [list("Stable preferences", "Corrections that prevent repeat errors", "Long-lived project decisions", "Reusable lessons from completed work"), callout("limitation", "Raya does not remember everything", "Conversation transcripts stay in sessions. Durable memory is intentionally compact and selective.")] },
      { id: "portability", title: "Ownership and portability", blocks: [p("Memory is ordinary Markdown under RAYA_HOME. You can inspect, edit, back up, or relocate it with the rest of Raya state.")] }
    ]
  },
  {
    slug: "context-files",
    title: "AGENTS.md and SOUL.md",
    description: "Separate project instructions from the personality you own.",
    sections: [
      { id: "agents", title: "AGENTS.md", blocks: [p("AGENTS.md carries project and workspace instructions: conventions, testing requirements, safety rules, scope boundaries, and repository maps. Raya loads it during agent creation.")] },
      { id: "soul", title: "SOUL.md", blocks: [p("SOUL.md defines user-authored tone, style, and character. It is deliberately visible and editable—not a hidden system prompt. Raya creates it with the complete default personality when the file is missing, both on installation and later startup; an existing file is never reset."), code("/character\n# choose default, technical, teacher, creative, pirate, noir, or another complete profile", "text"), p("Choosing a /character profile intentionally replaces ~/.raya/SOUL.md. You can then edit the file yourself; later starts preserve your changes.")] },
      { id: "resolution", title: "Resolution order", blocks: [p("For each file independently, Raya first checks RAYA_HOME. If that copy is absent, it walks upward from the current working directory and loads the nearest matching file."), code("~/.raya/AGENTS.md\n~/.raya/SOUL.md\n\n# otherwise nearest parent from the workspace\n./AGENTS.md\n./SOUL.md", "text"), callout("tip", "Independent fallback", "A global AGENTS.md can coexist with a workspace SOUL.md, or the other way around. Each filename resolves separately.")] }
    ]
  },
  {
    slug: "telegram",
    title: "Telegram gateway",
    description: "Reach the local Raya process from your own Telegram bot.",
    sections: [
      { id: "setup", title: "Setup", blocks: [p("Create a bot with @BotFather, copy its token, then configure Raya."), code("raya gateway --setup\nraya gateway --start"), p("Use --restart to establish a fresh Telegram connection in the current terminal.")] },
      { id: "availability", title: "Local process requirement", blocks: [callout("limitation", "Not a hosted service", "The bot works only while the Raya TUI or gateway process is running on your computer. Closing the process or turning off the machine makes it unavailable.")] },
      { id: "approvals", title: "Remote approvals", blocks: [p("Dangerous Telegram-originated actions—shell mutation, file writes, or closing an application—wait for inline Approve or Deny buttons. Timeout and denial both stop the action."), callout("security", "Restrict the chat", "Set an allowed chat ID during setup. Without one, anyone who knows the bot can send read-only requests to the running process.")] }
    ]
  },
  {
    slug: "scheduling",
    title: "Scheduling",
    description: "Persist one-time and daily tasks for Telegram delivery.",
    sections: [
      { id: "model", title: "Task model", blocks: [p("The schedule tool creates, lists, and cancels one-time or daily tasks. They are stored in ~/.raya/scheduled.json and loaded again when Raya starts."), list("One-time task at a specific time", "Daily repeating task", "Telegram delivery", "Optional browser notification for Web reminders")] },
      { id: "delivery", title: "Delivery and retry", blocks: [p("Every scheduled task requires Telegram delivery. If Telegram is unavailable or sending fails, Raya leaves the task pending for retry. Web reminders additionally create browser notifications."), callout("limitation", "A process must be running", "Scheduling is persistent, but execution is not a hosted daemon. A Raya process must be active to dispatch due work.")] }
    ]
  },
  {
    slug: "web",
    title: "Raya Web",
    description: "A localhost browser workspace backed by the same agent core.",
    sections: [
      { id: "start", title: "Start the app", blocks: [code("raya web\nraya web --port 5000\nraya web --no-open"), p("The server binds to 127.0.0.1 and defaults to port 4177. It does not expose a hosted cloud endpoint.")] },
      { id: "workspace", title: "Workspace surface", blocks: [list("Chat and saved sessions", "Plan / Build switching and browser approvals", "Calendar, reminders, and scheduled tasks", "Registered workspaces and file listing", "AGENTS.md and SOUL.md editing per workspace", "Connected notes with [[Note title]] bidirectional links"), p("Web-specific state is stored in owner-only ~/.raya/web.json.")] },
      { id: "security", title: "Local security", blocks: [p("The Web server rejects cross-origin requests and serves a restrictive content-security policy. Files are resolved from registered workspace roots."), callout("security", "Localhost is not a sandbox", "The Web interface controls the same local tools. Standard approvals remain important, especially for Build mode.")] }
    ]
  },
  {
    slug: "security",
    title: "Security",
    description: "Understand Raya's trust model before granting an agent local tools.",
    sections: [
      { id: "trust", title: "Trust model", blocks: [p("Raya is a local agent harness. Shell and filesystem tools execute with the permissions of the user who started Raya. Use it only in workspaces and with providers, skills, packages, and MCP servers you trust."), callout("security", "Raya is not a sandbox", "Plan restrictions, confirmations, path checks, and blocked commands reduce risk. They do not provide operating-system isolation.")] },
      { id: "modes", title: "Standard, Full, and Plan", blocks: [table(["Control", "Behavior"], [["Plan", "Restricts common mutation and exposes read-oriented tools"], ["Build + Standard", "Enables mutation and asks before consequential actions"], ["Build + Full", "Skips interactive approval; blocked commands still apply"]]), code("/security standard\nraya config --security standard", "text")] },
      { id: "shell", title: "Shell and filesystem", blocks: [p("Workspace writes resolve paths and symlinks to stay within the active root. Shell commands are checked against blocked prefixes, including common wrappers and chains. autoApproveCommands can bypass routine confirmations for trusted prefixes."), callout("warning", "Deny-lists are incomplete by nature", "A permitted interpreter, package script, or executable can still perform indirect mutation. Review commands and avoid Full mode for unfamiliar repositories.")] },
      { id: "external", title: "MCP and Telegram", blocks: [p("MCP servers are independent trust domains. Read-only annotations come from the server and may be incorrect. Telegram requests should be restricted to an allowed chat ID, and dangerous remote actions require inline approval."), p("Provider and Telegram credentials live in owner-only .env storage, separate from normal configuration. Environment placeholders keep MCP tokens out of config.json.")] },
      { id: "recommendations", title: "Safe operating habits", blocks: [list("Start in Plan and review the proposed scope.", "Use Standard security for everyday work.", "Keep destructive prefixes in blockedCommands.", "Run inside a focused, version-controlled workspace.", "Inspect skills and MCP configuration before enabling them.", "Keep an allowed Telegram chat ID configured.", "Review diffs and test output before publishing changes.")] }
    ]
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "How the CLI, model runtime, tools, context, and interfaces fit together.",
    sections: [
      { id: "flow", title: "Runtime flow", blocks: [code("User\n  ↓\nCLI / Raya Web / Telegram\n  ↓\nRaya orchestration\n  ├─ model runtime (reasoning)\n  ├─ tools + MCP (actions)\n  ├─ skills (procedures)\n  ├─ sessions + memory (continuity)\n  └─ workspace + apps + public web", "text"), p("src/cli/index.ts parses commands and assembles the selected interface. Provider runtime selects a model, MCP connects enabled servers, and create-agent combines system context with the applicable tools.")] },
      { id: "source-map", title: "Source map", blocks: [table(["Area", "Ownership"], [["src/cli", "Commands, setup, uninstall guards, process lifecycle"], ["src/backup", "Local/GitHub snapshots, package archives, listing, and restore"], ["src/providers", "Authentication, model discovery, runtime adapters"], ["src/agent", "System context and pi-agent-core assembly"], ["src/tools", "Built-in capability contracts and policy metadata"], ["src/tui", "Streaming terminal rendering and input"], ["src/mcp", "External server lifecycle and adapters"], ["src/skills + builtin-skills", "Progressive instruction discovery"], ["src/session + src/memory", "Conversation and durable continuity"], ["src/telegram + src/scheduler", "Remote messages and due-task delivery"], ["src/web", "Local browser application and storage"]])] },
      { id: "boundaries", title: "Important boundaries", blocks: [list("Raya is the harness; the model provides reasoning.", "Tools and MCP provide executable capabilities; skills provide instructions.", "Sessions preserve conversations; memory preserves compact durable facts.", "Interfaces collect approvals; tools declare and enforce capability policy.", "Built-in skill source is packaged, while installed folders are user-owned.")] }
    ]
  },
  {
    slug: "limitations",
    title: "Known limitations",
    description: "The current product boundaries, stated plainly.",
    sections: [
      { id: "current", title: "Current boundaries", blocks: [list("macOS and Linux are supported; Windows is not.", "Shell and filesystem access are not sandboxed.", "The web tool performs text search and fetch, not browser clicking or form automation.", "Telegram and scheduled delivery require a running local Raya process.", "Registering a local model does not download or start its server.", "Native Pi CLI extensions require a Raya adapter.", "Tool-calling and vision quality depend on the selected provider and model.", "MCP servers may fail, return untrusted content, or mislabel mutating tools.")] },
      { id: "roadmap", title: "Documented later work", blocks: [p("The repository lists provider-specific setup improvements, real sandboxing, browser automation, optional post-session consolidation, a more complete plugin loader, and Windows support as later roadmap items—not current capabilities.")] }
    ]
  },
  {
    slug: "contributing",
    title: "Contributing",
    description: "Build and validate Raya from source before proposing a change.",
    sections: [
      { id: "setup", title: "Development setup", blocks: [code("git clone https://github.com/SDH4114/Raya-APPLE.git\ncd Raya-APPLE\nnpm install\nnpm run build\nnpm test\nnpm run typecheck") ] },
      { id: "map", title: "Choose the owning module", blocks: [p("Start from the architecture page and the repository source map. Keep provider, tool, interface, and persistence responsibilities separate. Add a regression test for behavior that changes.")] },
      { id: "checks", title: "Before opening an issue or contribution", blocks: [code("npm test\nnpm run typecheck\nnpm run build"), list("Use an isolated RAYA_HOME for smoke tests.", "Do not write secrets into config, fixtures, logs, or skills.", "Preserve user-owned skills and unknown config fields.", "Document honest limitations and runtime requirements."), p("Use the project issue tracker for bugs and proposals.")] }
    ]
  },
  {
    slug: "reference/commands",
    title: "Commands reference",
    description: "Every built-in top-level and interactive command in the current capability catalog.",
    sections: [
      { id: "cli", title: "Top-level CLI", blocks: [table(["Command", "Purpose"], [["raya", "Start the interactive TUI"], ["raya <prompt>", "Run a one-shot request"], ["raya login / logout", "Manage provider authentication"], ["raya providers / models", "Inspect providers and models"], ["raya local add|remove|list", "Manage local endpoints"], ["raya config / status", "Change or inspect configuration"], ["raya update", "Compare GitHub and local versions, then update after confirmation"], ["raya backup --setup|--list|--restore", "Configure, save, inspect, or restore Raya backups"], ["raya uninstall", "Completely remove Raya after typed confirmation"], ["raya web", "Start the localhost Web app"], ["raya gateway --setup|--start|--restart", "Configure or run Telegram"], ["raya mcp list|add|enable|disable|remove|test", "Manage MCP servers"], ["raya skills list|sync", "Inspect or synchronize skills"], ["raya plugin install|list", "Manage supported Pi packages"], ["raya commands add|list|show|remove", "Manage personal direct commands"], ["raya yt [text]", "Open YouTube, or search it with text"], ["raya search / serach <text>", "Open web search"], ["raya git", "Stage, commit, and push"], ["raya open", "Open a desktop application"]])] },
      { id: "slash", title: "Interactive slash commands", blocks: [table(["Command", "Purpose"], [["/help", "Show commands and shortcuts"], ["/providers", "Connect, update, or choose providers"], ["/models", "Browse and choose models"], ["/thinking", "Set the reasoning level"], ["/character", "Choose Raya's personality"], ["/theme", "Choose Ocean Blue or Sunset Red"], ["/security", "Choose Standard or Full"], ["/sessions", "Create, open, or delete sessions"], ["/mcps", "Show configured MCP servers"], ["/skills", "Attach skills to the message"], ["/about", "Show the complete capability map"], ["/status", "Show runtime status"], ["/clear", "Clear the current conversation"], ["/exit", "Exit Raya"], ["!<command>", "Run a direct terminal line"]])] },
      { id: "personal", title: "Personal direct commands", blocks: [code("raya commands add serve --description \"Start development\" -- npm run dev\nraya serve --port 3000\nraya commands show serve\nraya commands remove serve"), p("Raya stores the executable and argument vector separately and launches without a shell. Extra invocation arguments are appended. Reserved built-in names cannot be replaced.")] }
    ]
  },
  {
    slug: "reference/configuration",
    title: "Configuration reference",
    description: "The validated fields accepted in ~/.raya/config.json.",
    sections: [
      { id: "fields", title: "Core fields", blocks: [table(["Field", "Type / values", "Default"], [["provider", "string", "openai-codex"], ["model", "string", "gpt-5.4"], ["mode", "plan | build", "plan"], ["thinkingLevel", "off | minimal | low | medium | high | xhigh | max", "minimal"], ["securityMode", "standard | full", "standard"], ["headerStyle", "small | large", "small"], ["theme", "ocean | sunset", "ocean"], ["shellTimeoutMs", "positive integer", "120000"], ["webTimeoutMs", "positive integer", "15000"], ["webMaxChars", "positive integer", "12000"]])] },
      { id: "collections", title: "Collections", blocks: [table(["Field", "Purpose"], [["hotkeys", "toggleMode, cancel, exit, clearScreen chords"], ["autoApproveCommands", "Trusted shell prefixes"], ["blockedCommands", "Denied shell prefixes; defaults to rm"], ["localModels", "Registered OpenAI-compatible endpoints"], ["piPackages", "Installed supported package names"], ["mcpServers", "Named stdio, HTTP, or SSE server configs"], ["backup", "Local/GitHub mode, display name, optional local root, sanitized repository, setup time"]])] },
      { id: "mcp-shape", title: "MCP server shape", blocks: [code('{\n  "mcpServers": {\n    "filesystem": {\n      "enabled": true,\n      "transport": "stdio",\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/project"],\n      "env": {},\n      "approval": "writes",\n      "timeoutMs": 30000,\n      "toolTimeoutMs": 120000\n    }\n  }\n}', "json"), p("Remote entries replace command/args/env with url/headers and transport http or sse. Compatibility normalization also accepts type as an alias and can infer transport from command or url.")] }
    ]
  }
];

export const docsBySlug = new Map(docs.map((page) => [page.slug, page]));
