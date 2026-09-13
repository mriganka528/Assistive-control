import Image from "next/image";
import Link from "next/link";
import { REPOSITORY_URL, RELEASE_VERSION } from "../lib/site";
import { Icon } from "./icon";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <Link href="/" className="brand"><Image src="/icon.svg" alt="" width={36} height={36} /><span>Assistive<span className="brand-light"> Control</span></span></Link>
          <p>Technology that meets you where you are.</p>
        </div>
        <nav aria-label="Footer navigation"><Link href="/guide">Getting started</Link><Link href="/#download">Download</Link><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub <Icon name="external" size={14} /></a></nav>
      </div>
      <div className="container footer-bottom"><span>© {new Date().getFullYear()} Assistive Control</span><span>Version {RELEASE_VERSION}<span className="footer-dot">·</span>Made for Windows</span></div>
    </footer>
  );
}
