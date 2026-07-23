"use client";

import { useState } from "react";

const modes = {
  plan: {
    prompt: "inspect this repository and map the auth flow",
    status: "investigating · no mutation",
    lines: ["read_file  src/cli/index.ts", "read_file  src/providers/runtime.ts", "use_skill  project-audit", "result     implementation plan ready"]
  },
  build: {
    prompt: "implement the approved auth fix and verify it",
    status: "building · standard approval",
    lines: ["write_file src/providers/runtime.ts", "shell      npm test", "diff       +18 / -6", "result     56 tests passed"]
  }
};

export function ProductDemo() {
  const [mode, setMode] = useState<keyof typeof modes>("plan");
  const active = modes[mode];
  return (
    <div className={`product-demo product-demo--${mode}`}>
      <div className="product-demo__top"><span>raya — ~/projects/raya</span><span>context 18%</span></div>
      <div className="product-demo__body">
        <div className="mode-switch" aria-label="Product preview mode">
          {(["plan", "build"] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>)}
        </div>
        <p className="demo-prompt"><span>[{mode === "plan" ? "Plan" : "Build"}]</span> &gt; {active.prompt}</p>
        <div className="demo-rule" />
        <p className="demo-speaker">Raya</p>
        <div className="demo-lines">{active.lines.map((line, index) => <p key={line}><span>{String(index + 1).padStart(2, "0")}</span>{line}</p>)}</div>
      </div>
      <div className="product-demo__status"><span>{active.status}</span><span>GPT-5.4 (medium) · v0.1.4</span></div>
    </div>
  );
}
