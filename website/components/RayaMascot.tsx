import type { RayaPose } from "@/config/mascot";

const terminalConfig: Record<RayaPose, { label: string; command: string; lines: string[] }> = {
  hero: {
    label: "Raya terminal preview",
    command: "inspect this repository",
    lines: ["read_file  AGENTS.md", "list_files src/", "use_skill  project-audit", "plan       ready to review"]
  },
  plan: { label: "Raya planning terminal", command: "raya --mode plan", lines: ["context    workspace loaded", "status     investigation only", "next       implementation plan"] },
  build: { label: "Raya build terminal", command: "raya --mode build", lines: ["approval   required for mutation", "tools      shell · files · web", "status     ready"] },
  connect: { label: "Raya connections terminal", command: "raya capabilities", lines: ["model      selected runtime", "tools      MCP + local tools", "workspace  memory + skills"] },
  memory: { label: "Raya memory terminal", command: "raya memory status", lines: ["USER.md    preferences loaded", "MEMORY.md  decisions loaded", "scope      current workspace"] },
  portrait: { label: "Raya terminal", command: "raya about", lines: ["agent      personal AI harness", "runtime    macOS · Linux", "license    MIT"] },
  cta: { label: "Start Raya terminal", command: "raya", lines: ["mode       plan", "workspace  ~/projects/current", "prompt     ready"] }
};

export function RayaMascot({ pose = "hero", compact = false }: { pose?: RayaPose; compact?: boolean }) {
  const terminal = terminalConfig[pose];
  return (
    <figure className={`terminal-raya ${compact ? "terminal-raya--compact" : ""}`} aria-label={terminal.label}>
      <div className="terminal-raya__bar"><span className="terminal-raya__lights" aria-hidden="true"><i /><i /><i /></span><span>raya — terminal</span><span>{pose.toUpperCase()}</span></div>
      <div className="terminal-raya__body">
        <p className="terminal-raya__prompt"><span>~/workspace</span> $ {terminal.command}</p>
        <div className="terminal-raya__output" aria-hidden="true">{terminal.lines.map((line) => <p key={line}><span>›</span>{line}</p>)}</div>
        <p className="terminal-raya__cursor"><span>›</span><b /></p>
      </div>
      <figcaption><span>●</span> connected · local-first</figcaption>
    </figure>
  );
}
