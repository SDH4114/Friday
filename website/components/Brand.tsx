import Link from "next/link";
import Image from "next/image";
import { withBasePath } from "@/config/site";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Raya home">
      <Image src={withBasePath("/brand/raya-mark.svg")} alt="" width="30" height="30" unoptimized />
      <span>RAYA</span>
      <small>A.P.P.L.E.</small>
    </Link>
  );
}
