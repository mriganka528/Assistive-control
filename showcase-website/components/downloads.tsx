import Link from "next/link";
import { DOWNLOADS, RELEASE_VERSION } from "../lib/site";
import { Icon } from "./icon";

export function Downloads() {
  return (
    <section className="download-section section" id="download" aria-labelledby="download-title">
      <div className="container">
        <div className="section-heading centered">
          <span className="eyebrow">YOUR NEXT STEP</span>
          <h2 id="download-title">A little movement.<br />A new way forward.</h2>
          <p>Choose how you want to get started. Same app, two ways to run it.</p>
        </div>
        <div className="download-grid">
          <article className="download-card recommended">
            <div className="download-card-top"><span className="download-icon"><Icon name="monitor" size={27} /></span><span className="recommend-label">Recommended</span></div>
            <h3>Windows installer</h3>
            <p>A familiar setup for your everyday computer.</p>
            <ul className="check-list"><li><Icon name="check" size={17} /> Guided installation</li><li><Icon name="check" size={17} /> Desktop and Start menu shortcuts</li><li><Icon name="check" size={17} /> All tracking models included</li></ul>
            <a className="button button-full" href={DOWNLOADS.setup}><Icon name="download" size={19} /> Download installer <span className="file-label">.exe</span></a>
            <span className="download-meta">v{RELEASE_VERSION} · Windows x64</span>
          </article>
          <article className="download-card">
            <div className="download-card-top"><span className="download-icon"><Icon name="usb" size={27} /></span><span className="subtle-label">No installation</span></div>
            <h3>Portable version</h3>
            <p>Download, open, and make yourself at home.</p>
            <ul className="check-list"><li><Icon name="check" size={17} /> Runs without an installer</li><li><Icon name="check" size={17} /> A single EXE to copy to another PC</li><li><Icon name="check" size={17} /> The same features and offline models</li></ul>
            <a className="button button-outline button-full" href={DOWNLOADS.portable}><Icon name="download" size={19} /> Download portable <span className="file-label">.exe</span></a>
            <span className="download-meta">v{RELEASE_VERSION} · Windows x64</span>
          </article>
        </div>
        <div className="requirements"><Icon name="windows" size={18} /><p>Windows 10 or 11 · 64-bit Intel / AMD · Webcam<br /><span>No Node.js or extra software needed. Only one download is necessary.</span></p></div>
        <p className="download-footnote">Downloads are hosted on GitHub. These builds are unsigned; Windows may show a publisher warning. <Link href="/guide#install">Read the setup guide <span aria-hidden="true">↗</span></Link></p>
      </div>
    </section>
  );
}
