import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { siteConfig, withBasePath } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: "Raya — A personal AI harness you can shape", template: "%s · Raya" },
  description: siteConfig.description,
  alternates: { canonical: "./" },
  openGraph: { type: "website", title: "Raya — A personal AI harness you can shape", description: siteConfig.description, url: siteConfig.url, siteName: "Raya" },
  twitter: { card: "summary", title: "Raya", description: siteConfig.description },
  manifest: withBasePath("/manifest.webmanifest"),
  icons: { icon: withBasePath("/brand/raya-mark.svg") }
};

export const viewport: Viewport = { themeColor: "#030B12", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "Raya",
    description: siteConfig.description,
    codeRepository: siteConfig.github,
    license: siteConfig.license,
    programmingLanguage: "TypeScript",
    runtimePlatform: "Node.js 22+",
    operatingSystem: "macOS, Linux"
  };
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><SiteHeader /><main id="main">{children}</main><SiteFooter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></body></html>;
}
