import Link from "next/link";
import { Terminal } from "lucide-react";
import { siteConfig } from "@/config/site";
import { CopyButton } from "./CopyButton";

export function InstallCommand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`install-command ${compact ? "install-command--compact" : ""}`}>
      <div className="install-command__bar"><span><Terminal size={14} />macOS / Linux</span><CopyButton value={siteConfig.installCommand} /></div>
      <code><span>$</span> {siteConfig.installCommand}</code>
      {!compact && <Link href="/docs/installation">View installation guide →</Link>}
    </div>
  );
}
