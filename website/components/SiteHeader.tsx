"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ArrowUpRight, Download } from "lucide-react";
import { mainNavigation } from "@/config/navigation";
import { Brand } from "./Brand";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {mainNavigation.map((item) => "external" in item && item.external ? (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}<ArrowUpRight size={13} /></a>
          ) : <Link key={item.label} href={item.href}>{item.label}</Link>)}
        </nav>
        <Link className="button button--small header-install" href="/docs/installation"><Download size={15} />Install Raya</Link>
        <button className="mobile-toggle" type="button" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="mobile-nav shell" aria-label="Mobile navigation">
          {mainNavigation.map((item) => "external" in item && item.external ? (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>{item.label}<ArrowUpRight size={15} /></a>
          ) : <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}
          <Link href="/docs/installation" onClick={() => setOpen(false)}>Install Raya</Link>
        </nav>
      )}
    </header>
  );
}
