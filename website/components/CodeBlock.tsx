import { CopyButton } from "./CopyButton";

export function CodeBlock({ code, language = "text" }: { code: string; language?: string }) {
  return (
    <div className="code-block">
      <div className="code-block__bar"><span>{language}</span><CopyButton value={code} /></div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
