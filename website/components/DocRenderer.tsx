import Link from "next/link";
import { ArrowLeft, ArrowRight, PencilLine } from "lucide-react";
import { allDocLinks } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import type { DocBlock, DocPage } from "@/content/docs";
import { CodeBlock } from "./CodeBlock";

function renderBlock(block: DocBlock, index: number) {
  if (block.type === "p") return <p key={index}>{block.text}</p>;
  if (block.type === "code") return <CodeBlock key={index} code={block.code} language={block.language} />;
  if (block.type === "list") return <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  if (block.type === "callout") return <aside key={index} className={`callout callout--${block.tone}`}><strong>{block.title}</strong><p>{block.text}</p></aside>;
  return <div className="table-wrap" key={index}><table><thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function DocRenderer({ page }: { page: DocPage }) {
  const currentIndex = allDocLinks.findIndex((item) => item.href === `/docs/${page.slug}`);
  const previous = currentIndex > 0 ? allDocLinks[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? allDocLinks[currentIndex + 1] : undefined;
  return (
    <>
      <div className="breadcrumbs"><Link href="/docs">Docs</Link><span>/</span><span>{page.title}</span></div>
      <article className="doc-article">
        <header><h1>{page.title}</h1><p>{page.description}</p></header>
        {page.sections.map((section) => <section id={section.id} key={section.id}><h2><a href={`#${section.id}`}>{section.title}</a></h2>{section.blocks.map(renderBlock)}</section>)}
        <a className="edit-link" href={`${siteConfig.github}/edit/prime/website/content/docs.ts`} target="_blank" rel="noreferrer"><PencilLine size={15} />Edit this page on GitHub</a>
      </article>
      <nav className="doc-pagination" aria-label="Previous and next documentation pages">
        {previous ? <Link href={previous.href}><ArrowLeft size={15} /><span><small>Previous</small>{previous.title}</span></Link> : <span />}
        {next ? <Link href={next.href}><span><small>Next</small>{next.title}</span><ArrowRight size={15} /></Link> : <span />}
      </nav>
    </>
  );
}
