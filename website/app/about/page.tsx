import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { RayaMascot } from "@/components/RayaMascot";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "About", description: "Raya's purpose, identity, and open-source project principles." };

export default function AboutPage() {
  return <div className="standard-page shell"><div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>About</span></div><div className="about-hero"><div><p className="section-index">ABOUT / RAYA</p><h1>A calm mind for complex systems.</h1><p>Raya is an open-source personal AI PC assistant and coding-agent harness for real work from the terminal and browser. The product is the orchestration layer—not a wrapper around one model.</p></div><RayaMascot pose="portrait" /></div><div className="about-grid"><section><h2>Purpose</h2><p>Help a developer understand a project deeply, plan a controlled path, and execute it with visible tools and reviewable output.</p></section><section><h2>Character</h2><p>Calm, serious, kind, attentive, and reliable. The textual Raya identity keeps that character without turning the engineering product into an anime or AI-art showcase.</p></section><section><h2>Ownership</h2><p>Your workspace, sessions, memory, context files, skills, and provider choices remain explicit. RAYA_HOME is a portable boundary you can inspect and back up.</p></section><section><h2>Open source</h2><p>The code is available under the MIT license. Current limitations are documented alongside capabilities.</p></section></div><div className="page-actions"><a className="button" href={siteConfig.github} target="_blank" rel="noreferrer"><Github size={16} />View the repository</a><Link className="button button--ghost" href="/docs/architecture">Architecture<ArrowRight size={16} /></Link></div></div>;
}
