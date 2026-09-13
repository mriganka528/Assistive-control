import Link from "next/link";
import { Icon } from "../components/icon";

export default function NotFound() {
  return <main id="main" className="container not-found"><span className="eyebrow">404 · PAGE NOT FOUND</span><h1>Let’s get you back.</h1><p>This page isn’t here, but your next step is.</p><Link href="/" className="button">Back to Assistive Control <Icon name="arrow" size={18} /></Link></main>;
}
