import type { DocSection } from "@/content/docs";

export function TableOfContents({ sections }: { sections: DocSection[] }) {
  return <aside className="toc"><p>On this page</p>{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</aside>;
}
