import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocRenderer } from "@/components/DocRenderer";
import { TableOfContents } from "@/components/TableOfContents";
import { docs, docsBySlug } from "@/content/docs";

export function generateStaticParams() { return docs.map((page) => ({ slug: page.slug.split("/") })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = docsBySlug.get(slug.join("/"));
  return page ? { title: page.title, description: page.description } : {};
}

export default async function DocumentationPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = docsBySlug.get(slug.join("/"));
  if (!page) notFound();
  return <div className="doc-page"><div><DocRenderer page={page} /></div><TableOfContents sections={page.sections} /></div>;
}
