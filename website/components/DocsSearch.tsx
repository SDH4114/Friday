"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { allDocLinks } from "@/config/navigation";

export function DocsSearch() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? allDocLinks.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(normalized)).slice(0, 8) : [];
  }, [query]);
  return (
    <div className="docs-search">
      <Search size={15} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation" aria-label="Search documentation" />
      {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
      {query && <div className="docs-search__results">{results.length ? results.map((item) => <Link key={item.href} href={item.href} onClick={() => setQuery("")}><strong>{item.title}</strong><span>{item.description}</span></Link>) : <p>No matching pages.</p>}</div>}
    </div>
  );
}
