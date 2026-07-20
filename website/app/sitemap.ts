import type { MetadataRoute } from "next";
import { docs } from "@/content/docs";
import { siteConfig } from "@/config/site";

export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/about", "/docs", ...docs.map((page) => `/docs/${page.slug}`)].map((path) => ({ url: `${siteConfig.url}${path}`, changeFrequency: path === "" ? "weekly" as const : "monthly" as const, priority: path === "" ? 1 : path === "/docs" ? 0.9 : 0.7 }));
}
