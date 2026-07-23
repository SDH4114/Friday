"use client";

import Link from "next/link";
import { useState } from "react";
import { Terminal } from "lucide-react";
import { siteConfig } from "@/config/site";
import { CopyButton } from "./CopyButton";

const platforms = {
  windows: { label: "Windows", prompt: "PS>", command: siteConfig.windowsInstallCommand },
  unix: { label: "macOS / Linux", prompt: "$", command: siteConfig.installCommand }
} as const;

export function InstallCommand({ compact = false }: { compact?: boolean }) {
  const [platform, setPlatform] = useState<keyof typeof platforms>("windows");
  const selected = platforms[platform];
  return (
    <div className={`install-command ${compact ? "install-command--compact" : ""}`}>
      <div className="install-command__bar">
        <div className="install-command__platforms" aria-label="Choose operating system">
          <Terminal size={14} aria-hidden="true" />
          {Object.entries(platforms).map(([id, value]) => (
            <button
              key={id}
              type="button"
              aria-pressed={platform === id}
              onClick={() => setPlatform(id as keyof typeof platforms)}
            >
              {value.label}
            </button>
          ))}
        </div>
        <CopyButton value={selected.command} />
      </div>
      <code><span>{selected.prompt}</span> {selected.command}</code>
      {compact ? null : <Link href="/docs/installation">View installation guide →</Link>}
    </div>
  );
}
