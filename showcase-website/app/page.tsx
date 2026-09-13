import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "../components/icon";
import { Downloads } from "../components/downloads";
import { ScreenshotGallery } from "../components/screenshot-gallery";
import { MovementDemo } from "../components/movement-demo";
import { DOWNLOADS, RELEASE_VERSION, faqs } from "../lib/site";

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: "cursor", title: "Point, click, carry on.", description: "Move the real Windows pointer, click, scroll, and confirm. Use your personalized controls across other applications." },
  { icon: "hand", title: "Start with what you can do.", description: "A small face or hand movement can be a starting point. Calibration looks for your reliable signals, without prescribing one gesture." },
  { icon: "refresh", title: "Room for changing days.", description: "Recheck your baseline or review a suggested alternative when a movement becomes less reliable. Assisted switching keeps you involved." },
  { icon: "settings", title: "Comfort is personal.", description: "Fine-tune speed, sensitivity, and movement assignments. Use once, twice, and hold patterns to make a movement do more." },
  { icon: "lock", title: "Your camera stays yours.", description: "Face and hand tracking run locally. No accounts, uploaded camera frames, or cloud processing. The downloaded app works offline." },
  { icon: "shield", title: "A pause is always okay.", description: "Take a break with Pause, or stop with Ctrl + Shift + X. The control loop also freezes when tracking is lost or confidence drops." },
];

export default function HomePage() {
  return (
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <a href="#download" className="release-pill"><span className="status-dot" />Meet Assistive Control <span className="pill-version">v{RELEASE_VERSION}</span><Icon name="arrow" size={15} /></a>
            <h1 id="hero-title">Small movements.<br /><span>More independence.</span></h1>
            <p className="hero-description">Your computer, controlled your way. Turn the face and hand movements that work for you into a more personal way to point, click, and scroll.</p>
            <div className="hero-actions"><a href={DOWNLOADS.setup} className="button button-large"><Icon name="windows" size={20} />Download for Windows<Icon name="download" size={18} /></a><a href="#how-it-works" className="text-link">See how it works <Icon name="arrow" size={18} /></a></div>
            <div className="hero-details"><span>Windows 10 / 11</span><i aria-hidden="true" /><span>Works offline</span><i aria-hidden="true" /><a href={DOWNLOADS.portable}>Portable version <span aria-hidden="true">↗</span></a></div>
          </div>
          <div className="hero-visual">
            <div className="visual-orbit orbit-one" aria-hidden="true" /><div className="visual-orbit orbit-two" aria-hidden="true" />
            <div className="hero-app-window">
              <div className="window-toolbar"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><span>Assistive Control</span><Icon name="monitor" size={15} /></div>
              <Image src="/screenshots/home.png" alt="The actual Assistive Control home screen, with a saved example profile and real input enabled." width={1200} height={820} priority sizes="(max-width: 900px) 90vw, 640px" />
            </div>
            <div className="visual-note note-private"><span className="note-icon"><Icon name="shield" size={21} /></span><div><strong>On your device. Only.</strong><span>No camera data uploaded</span></div></div>
            <div className="visual-note note-personal"><span className="tiny-signal" aria-hidden="true"><i /><i /><i /><i /><i /></span><div><strong>Built around your movement</strong><span>Face + hand tracking</span></div></div>
            <span className="hero-visual-label">A familiar interface. A different way in.</span>
          </div>
        </div>
        <div className="container principle-strip"><div><Icon name="camera" /><span>Just your webcam</span></div><div><Icon name="settings" /><span>Personalized to you</span></div><div><Icon name="lock" /><span>Private by design</span></div><div><Icon name="heart" /><span>At your own pace</span></div></div>
      </section>

      <section className="section how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <div className="section-heading"><span className="eyebrow">A DIFFERENT STARTING POINT</span><h2 id="how-title">You bring the movement.<br />The app finds the possibilities.</h2><p>You don’t have to learn a fixed set of gestures. Start with a movement that feels comfortable, and build from there.</p></div>
          <div className="how-layout"><ol className="steps-list">
            <li><span className="step-number">01</span><div><h3>Find your comfortable movements</h3><p>Let the webcam capture a resting baseline. Then try small, repeatable movements so the app can find your strongest signals.</p></div></li>
            <li><span className="step-number">02</span><div><h3>Make them your controls</h3><p>Calibration creates a starting mapping. Review it in Settings and choose what each movement should do.</p></div></li>
            <li><span className="step-number">03</span><div><h3>Settle into your own rhythm</h3><p>Start Live Control, adjust the speed, and pause whenever you need. Recheck or recalibrate as your movement changes.</p></div></li>
          </ol><MovementDemo /></div>
          <Link href="/guide" className="text-link how-guide-link">Walk through your first session <Icon name="arrow" size={18} /></Link>
        </div>
      </section>

      <section className="section features-section" id="features" aria-labelledby="features-title"><div className="container"><div className="section-heading heading-row"><div><span className="eyebrow">LESS FRICTION. MORE YOU.</span><h2 id="features-title">Made for the way<br />you move.</h2></div><p>Practical controls, thoughtful adjustments, and a little more room to do things your way.</p></div><div className="features-grid">{features.map(feature => <article className="feature" key={feature.title}><span className="feature-icon"><Icon name={feature.icon} size={25} /></span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div></div></section>

      <section className="section screenshots-section" id="screenshots" aria-labelledby="screenshots-title"><div className="container"><div className="section-heading centered"><span className="eyebrow">TAKE A LOOK AROUND</span><h2 id="screenshots-title">Simple on the surface.<br />Personal underneath.</h2><p>A calm interface, clear choices, and controls you can make your own.<br className="desktop-only" /> Here’s what you’ll find inside the actual app.</p></div><ScreenshotGallery /></div></section>

      <section className="guide-banner"><div className="container guide-banner-inner"><div className="guide-banner-copy"><span className="eyebrow">YOUR FIRST SESSION</span><h2>A little guidance goes a long way.</h2><p>From allowing camera access to finding your first movement, we’ll walk you through it. Take your time. Having someone help with setup is okay, too.</p><Link href="/guide" className="button button-light">Open the getting-started guide <Icon name="arrow" size={19} /></Link></div><div className="safety-note"><span className="safety-note-icon"><Icon name="shield" size={28} /></span><h3>A shortcut worth knowing</h3><div className="shortcut" aria-label="Control plus Shift plus X"><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>X</kbd></div><p>Stops control, even when another window is focused.</p><span className="safety-detail">Live Control starts automatically when the camera is ready. Learn Pause and Emergency stop before your first session.</span></div></div></section>

      <Downloads />

      <section className="section faq-section" id="faq" aria-labelledby="faq-title"><div className="container faq-layout"><div className="section-heading"><span className="eyebrow">A FEW THINGS TO KNOW</span><h2 id="faq-title">Questions,<br />answered.</h2><p>Getting started should feel clear.</p><Link href="/guide#troubleshooting" className="text-link">Setup & troubleshooting <Icon name="arrow" size={18} /></Link></div><div className="faq-list">{faqs.map(faq => <details key={faq.question}><summary>{faq.question}<Icon name="plus" size={20} /></summary><p>{faq.answer}</p></details>)}</div></div></section>
    </main>
  );
}
