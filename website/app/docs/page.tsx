import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { docsNavigation } from "@/config/navigation";

export const metadata: Metadata = { title: "Documentation", description: "Learn how to install, configure, extend, and safely operate Raya." };

export default function DocsIndexPage() {
  return <div className="docs-index"><div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Docs</span></div><header><p className="section-index">RAYA / DOCUMENTATION</p><h1>Understand the harness.</h1><p>Start with a working session, then learn how models, tools, skills, MCP, memory, interfaces, and security fit together.</p></header><div className="docs-index__start"><div><span>01</span><h2>First time here?</h2><p>Install Raya, connect a provider or local endpoint, and use Plan before Build.</p></div><Link className="button" href="/docs/quickstart">Open the quickstart<ArrowRight size={16} /></Link></div><div className="docs-index__groups">{docsNavigation.slice(1).map((group) => <section key={group.title}><h2>{group.title}</h2>{group.items.map((item) => <Link key={item.href} href={item.href}><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={15} /></Link>)}</section>)}</div></div>;
}
