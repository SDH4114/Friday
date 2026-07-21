import Link from "next/link";
import { Brand } from "./Brand";
import { siteConfig } from "@/config/site";

const groups = [
  { title: "Product", links: [["Features", "/#features"], ["Installation", "/docs/installation"], ["Documentation", "/docs"], ["Architecture", "/docs/architecture"], ["Limitations", "/docs/limitations"]] },
  { title: "Developers", links: [["GitHub", siteConfig.github], ["Contributing", "/docs/contributing"], ["Issues", siteConfig.issues], ["Commands", "/docs/reference/commands"]] },
  { title: "Project", links: [["MIT License", siteConfig.license], ["About Raya", "/about"], ["Security", "/docs/security"], ["Telegram channel", siteConfig.telegramChannel]] }
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer" id="community">
      <div className="shell footer-grid">
        <div className="footer-intro"><Brand /><p>Understand deeply.<br />Plan clearly.<br />Build precisely.</p></div>
        {groups.map((group) => <div key={group.title}><h2>{group.title}</h2>{group.links.map(([label, href]) => href.startsWith("http") ? <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a> : <Link key={label} href={href}>{label}</Link>)}</div>)}
      </div>
      <div className="shell footer-bottom"><span>© {new Date().getFullYear()} Raya contributors.</span><span>Open source · MIT licensed · Built for macOS and Linux.</span></div>
    </footer>
  );
}
