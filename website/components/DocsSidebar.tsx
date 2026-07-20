"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNavigation } from "@/config/navigation";
import { DocsSearch } from "./DocsSearch";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="docs-sidebar">
      <DocsSearch />
      <nav aria-label="Documentation navigation">
        {docsNavigation.map((group) => <section key={group.title}><h2>{group.title}</h2>{group.items.map((item) => <Link className={pathname === item.href || pathname === `${item.href}/` ? "active" : ""} key={item.href} href={item.href}>{item.title}</Link>)}</section>)}
      </nav>
    </aside>
  );
}
