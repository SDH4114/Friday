import Link from "next/link";
import { ArrowRight, ArrowUpRight, Boxes, Check, CircleAlert, Github, LockKeyhole, TerminalSquare } from "lucide-react";
import { InstallCommand } from "@/components/InstallCommand";
import { ProductDemo } from "@/components/ProductDemo";
import { RayaMascot } from "@/components/RayaMascot";
import { siteConfig } from "@/config/site";

const features = [
  { number: "01", label: "WORK", title: "Deep workspace understanding", text: "Files, folders, attachments, AGENTS.md, SOUL.md, readable Markdown, tool activity, diffs, and shell output stay in one reviewable flow.", artifact: ["@file:\"src/agent/create-agent.ts\"", "@folder:\"src/tools\"", "mode: plan → build"] },
  { number: "02", label: "CHOOSE", title: "Bring your own model", text: "Use OpenAI Codex OAuth, API-key providers, or an OpenAI-compatible server you already run with Ollama, LM Studio, vLLM, or llama.cpp.", artifact: ["openai-codex  connected", "anthropic     api key", "ollama        localhost"] },
  { number: "03", label: "EXTEND", title: "Tools, MCP, and skills", text: "Models reason. Raya orchestrates. Tools act. Skills provide procedures. MCP adds executable capabilities, resources, and prompts.", artifact: ["tool  → executable action", "skill → reusable procedure", "mcp   → external capability"] },
  { number: "04", label: "DELEGATE", title: "Bounded subagents", text: "Delegate one focused investigation or implementation task to an isolated context that inherits the current model, mode, workspace policy, and MCP runtime.", artifact: ["task: audit provider flow", "scope: src/providers", "mode: plan"] },
  { number: "05", label: "REMEMBER", title: "Continuity you can inspect", text: "Workspace-bound sessions keep conversation state. USER.md and MEMORY.md hold compact preferences, decisions, corrections, and reusable lessons.", artifact: ["sessions.json", "USER.md", "MEMORY.md"] },
  { number: "06", label: "CONNECT", title: "Terminal, Web, Telegram", text: "Work from the TUI, a localhost Web app, or your own Telegram bot. Calendar, reminders, workspaces, notes, and scheduled delivery remain local-first.", artifact: ["raya", "raya web :4177", "raya gateway --start"] },
  { number: "07", label: "CONTROL", title: "Security stays visible", text: "Plan and Build, Standard and Full, blocked commands, MCP policies, and Telegram approvals make consequential actions explicit.", artifact: ["security: standard", "blocked: rm", "approval: required"] },
  { number: "08", label: "PERSONALIZE", title: "Make the harness yours", text: "Configure hotkeys, themes, reasoning, direct commands, context files, local providers, workspace skills, and the complete RAYA_HOME boundary.", artifact: ["theme: ocean", "toggleMode: tab", "RAYA_HOME=~/.raya"] }
];

export default function HomePage() {
  return (
    <>
      <section className="hero shell">
        <div className="hero__copy">
          <p className="hero__eyebrow">Open Source · MIT Licensed · macOS & Linux</p>
          <h1>Your companion in the depth of code.</h1>
          <p className="hero__lede">Raya is a personal AI coding-agent harness that understands your workspace, plans carefully, builds with real tools, remembers what matters, and works with the models you choose.</p>
          <div className="hero__actions"><Link className="button" href="/docs/installation">Install Raya<ArrowRight size={17} /></Link><a className="button button--ghost" href={siteConfig.github} target="_blank" rel="noreferrer"><Github size={17} />View on GitHub</a><Link className="text-link" href="/docs">Read the documentation →</Link></div>
          <InstallCommand />
        </div>
        <div className="hero__visual"><RayaMascot pose="hero" /><div className="hero__note"><span>PRODUCT PREVIEW / TEXT MODE</span><p>[Plan] &gt; inspect this repository</p><ul><li>Reading workspace instructions</li><li>Mapping project structure</li><li>Loading relevant skills</li><li>Preparing an implementation plan</li></ul></div></div>
      </section>

      <section className="workflow shell" aria-labelledby="workflow-title">
        <div className="section-index">CORE / 00</div><h2 id="workflow-title">Understand deeply.<br />Plan clearly.<br />Build precisely.</h2>
        <div className="workflow__steps">
          <article><span>01</span><h3>Understand</h3><p>Read the workspace, attachments, project instructions, previous context, and relevant skills.</p></article>
          <article><span>02</span><h3>Plan</h3><p>Investigate before changing anything and produce a clear, reviewable approach.</p></article>
          <article><span>03</span><h3>Build</h3><p>Edit files, run tools, show diffs, and ask before consequential actions when required.</p></article>
        </div>
      </section>

      <section id="features" className="features shell" aria-labelledby="features-title">
        <div className="section-heading"><div><div className="section-index">SYSTEM / CAPABILITIES</div><h2 id="features-title">One environment.<br />Clear boundaries.</h2></div><p>Raya brings the model, workspace, tools, instructions, and persistent context into one local agent loop—without pretending they are the same thing.</p></div>
        <div className="feature-list">{features.map((feature, index) => <article className="feature-row" key={feature.number}><div className="feature-row__index"><span>{feature.number}</span><small>{feature.label}</small></div><div className="feature-row__copy"><h3>{feature.title}</h3><p>{feature.text}</p><Link href={index === 1 ? "/docs/providers" : index === 2 ? "/docs/mcp" : index === 4 ? "/docs/memory" : index === 5 ? "/docs/web" : index === 6 ? "/docs/security" : "/docs"}>Explore this capability <ArrowRight size={14} /></Link></div><pre>{feature.artifact.join("\n")}</pre></article>)}</div>
      </section>

      <section className="preview-section shell" aria-labelledby="preview-title">
        <div className="section-heading"><div><div className="section-index">INTERFACE / TUI</div><h2 id="preview-title">Work that stays readable.</h2></div><p>The preview changes locally between Plan and Build. It demonstrates the interaction model; it is not a live Raya process.</p></div>
        <ProductDemo />
      </section>

      <section className="architecture-section shell" aria-labelledby="architecture-title">
        <div><div className="section-index">ARCHITECTURE / 01</div><h2 id="architecture-title">Raya is the harness.</h2><p>The selected model supplies reasoning. Raya assembles the context, chooses available capabilities, streams work to the interface, and preserves continuity.</p><Link className="text-link" href="/docs/architecture">Read the architecture →</Link></div>
        <div className="architecture-map" role="img" aria-label="Raya architecture flow"><div>User</div><span>↓</span><div>CLI / Web / Telegram</div><span>↓</span><div className="architecture-map__core">Raya orchestration</div><span>↓</span><div className="architecture-map__branches"><span>Model runtime</span><span>Tools / MCP</span><span>Skills</span><span>Subagents</span></div><span>↓</span><div>Workspace / Apps / Public web / Memory</div></div>
      </section>

      <section className="boundaries shell" aria-labelledby="boundaries-title">
        <div className="boundaries__title"><CircleAlert /><div><div className="section-index">CURRENT BOUNDARIES</div><h2 id="boundaries-title">No hidden fine print.</h2></div></div>
        <ul><li><Check />macOS and Linux; no current Windows support.</li><li><LockKeyhole />Shell and filesystem tools are not sandboxed.</li><li><TerminalSquare />Web research is text search/fetch, not browser automation.</li><li><Check />Telegram and scheduling require a running local process.</li><li><Boxes />Native Pi extensions need a Raya adapter.</li><li><Check />Tool calling depends on the selected model.</li></ul>
        <Link href="/docs/limitations">Read all known limitations <ArrowRight size={15} /></Link>
      </section>

      <section className="open-source shell">
        <div><div className="section-index">OPEN SOURCE / MIT</div><h2>Inspect the code.<br />Shape the tool.</h2><p>Raya is local-first, MIT licensed, and developed in the open. No invented counters—just the repository, issues, documentation, and a clear contribution path.</p></div>
        <div className="open-source__links"><a href={siteConfig.github} target="_blank" rel="noreferrer">Repository<ArrowUpRight /></a><a href={siteConfig.issues} target="_blank" rel="noreferrer">Issues<ArrowUpRight /></a><Link href="/docs/contributing">Contributing<ArrowRight /></Link></div>
      </section>

      <section className="final-cta shell">
        <div><div className="section-index">READY / FIRST SESSION</div><h2>Go deeper with Raya.</h2><p>Start in Plan. Let the project explain itself. Move to Build when the path is clear.</p><InstallCommand compact /><div className="final-cta__links"><Link className="button" href="/docs/quickstart">Quickstart<ArrowRight size={16} /></Link><a className="button button--ghost" href={siteConfig.github} target="_blank" rel="noreferrer">GitHub<Github size={16} /></a></div></div><RayaMascot pose="cta" compact /></section>
    </>
  );
}
