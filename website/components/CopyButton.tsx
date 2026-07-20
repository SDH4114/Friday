"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <button className="copy-button" type="button" onClick={copy} aria-label={`${label} to clipboard`}>{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? "Copied" : label}</span></button>;
}
