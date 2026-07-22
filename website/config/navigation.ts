export type DocLink = { title: string; href: string; description: string };
export type DocGroup = { title: string; items: DocLink[] };

export const docsNavigation: DocGroup[] = [
  {
    title: "Start",
    items: [
      { title: "Documentation", href: "/docs", description: "How Raya works and where to begin." },
      { title: "Quickstart", href: "/docs/quickstart", description: "Install, connect a provider, and start a session." },
      { title: "Installation", href: "/docs/installation", description: "Supported systems, installer, updates, and PATH." }
    ]
  },
  {
    title: "Core concepts",
    items: [
      { title: "CLI", href: "/docs/cli", description: "Interactive TUI, prompts, attachments, and shortcuts." },
      { title: "Configuration", href: "/docs/configuration", description: "Settings under RAYA_HOME." },
      { title: "Providers and models", href: "/docs/providers", description: "OAuth, API keys, and model selection." },
      { title: "Local models", href: "/docs/local-models", description: "Ollama, LM Studio, vLLM, and llama.cpp." },
      { title: "Plan and Build", href: "/docs/plan-build", description: "Investigation and mutation boundaries." },
      { title: "Tools", href: "/docs/tools", description: "Built-in executable capabilities." }
    ]
  },
  {
    title: "Extend",
    items: [
      { title: "MCP", href: "/docs/mcp", description: "Connect stdio, HTTP, and SSE servers." },
      { title: "Skills", href: "/docs/skills", description: "Reusable instructions and skill authoring." },
      { title: "Profiles", href: "/docs/profiles", description: "Isolated identity, instructions, memory, and sessions." },
      { title: "Sessions", href: "/docs/sessions", description: "Workspace-bound conversation state." },
      { title: "Memory", href: "/docs/memory", description: "Durable USER.md and MEMORY.md facts." },
      { title: "AGENTS.md and SOUL.md", href: "/docs/context-files", description: "Profile identity and project rules." }
    ]
  },
  {
    title: "Interfaces",
    items: [
      { title: "Telegram", href: "/docs/telegram", description: "Local gateway and remote approvals." },
      { title: "Scheduling", href: "/docs/scheduling", description: "One-time and daily Telegram reminders." },
      { title: "Raya Web", href: "/docs/web", description: "Local browser workspace." }
    ]
  },
  {
    title: "Project",
    items: [
      { title: "Security", href: "/docs/security", description: "Trust model, approvals, and limits." },
      { title: "Architecture", href: "/docs/architecture", description: "Runtime flow and source ownership." },
      { title: "Known limitations", href: "/docs/limitations", description: "Current boundaries without marketing gloss." },
      { title: "Contributing", href: "/docs/contributing", description: "Build, test, and propose changes." }
    ]
  },
  {
    title: "Reference",
    items: [
      { title: "Commands", href: "/docs/reference/commands", description: "CLI and slash-command reference." },
      { title: "Configuration fields", href: "/docs/reference/configuration", description: "Validated config.json schema." }
    ]
  }
];

export const allDocLinks = docsNavigation.flatMap((group) => group.items);

export const mainNavigation = [
  { label: "Features", href: "/#features" },
  { label: "Documentation", href: "/docs" },
  { label: "GitHub", href: "https://github.com/SDH4114/Raya-APPLE", external: true },
  { label: "Telegram", href: "https://t.me/BreakRulesStudio", external: true },
  { label: "Community", href: "/#community" }
] as const;
