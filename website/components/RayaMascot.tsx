import { mascotConfig, type RayaPose } from "@/config/mascot";

export function RayaMascot({ pose = "hero", compact = false }: { pose?: RayaPose; compact?: boolean }) {
  const mascot = mascotConfig[pose];
  return (
    <figure className={`ascii-raya ${compact ? "ascii-raya--compact" : ""}`} aria-label={mascot.label}>
      <div className="ascii-raya__meta"><span>RAYA.SYSTEMS</span><span>{pose.toUpperCase()}</span></div>
      <pre aria-hidden="true">{mascot.lines.join("\n")}</pre>
      <figcaption>{mascot.label}</figcaption>
    </figure>
  );
}
