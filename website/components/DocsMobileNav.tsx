"use client";

import { useState } from "react";
import { List, X } from "lucide-react";
import { DocsSidebar } from "./DocsSidebar";

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);
  return <div className="docs-mobile"><button type="button" onClick={() => setOpen(true)}><List size={16} />Browse documentation</button>{open && <div className="docs-mobile__drawer"><div className="docs-mobile__top"><strong>Documentation</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close documentation navigation"><X /></button></div><DocsSidebar /></div>}</div>;
}
