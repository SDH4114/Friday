import { DocsMobileNav } from "@/components/DocsMobileNav";
import { DocsSidebar } from "@/components/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <div className="docs-layout shell"><DocsMobileNav /><DocsSidebar /><div className="docs-main">{children}</div></div>;
}
