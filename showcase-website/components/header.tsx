"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById("menu-toggle")?.focus();
      }
    };
    if (open) document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Assistive Control home" onClick={() => setOpen(false)}>
          <Image src="/icon.svg" alt="" width={39} height={39} priority />
          <span>Assistive<span className="brand-light"> Control</span></span>
        </Link>
        <button className="menu-toggle" id="menu-toggle" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          <Icon name={open ? "close" : "menu"} />
        </button>
        <nav id="site-nav" className={`site-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
          <Link href="/#how-it-works" onClick={() => setOpen(false)}>How it works</Link>
          <Link href="/#features" onClick={() => setOpen(false)}>Features</Link>
          <Link href="/#screenshots" onClick={() => setOpen(false)}>Inside the app</Link>
          <Link href="/guide" aria-current={pathname === "/guide" ? "page" : undefined} onClick={() => setOpen(false)}>Get started</Link>
          <Link href="/#download" className="button button-small" onClick={() => setOpen(false)}><Icon name="download" size={17} /> Download</Link>
        </nav>
      </div>
    </header>
  );
}
