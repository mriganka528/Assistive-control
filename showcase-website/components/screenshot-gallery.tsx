"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { screenshots } from "../lib/site";
import { Icon } from "./icon";

export function ScreenshotGallery() {
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const zoomButton = useRef<HTMLButtonElement>(null);
  const selected = screenshots[active];

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % screenshots.length;
    else if (event.key === "ArrowLeft") next = (index + screenshots.length - 1) % screenshots.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = screenshots.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    document.getElementById(`screenshot-tab-${next}`)?.focus();
  }

  return (
    <>
      <div className="gallery-tabs" role="tablist" aria-label="Application screenshots">
        {screenshots.map((item, index) => <button key={item.id} id={`screenshot-tab-${index}`} role="tab" aria-selected={active === index} aria-controls="screenshot-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={event => navigate(event, index)}><span className="tab-number">0{index + 1}</span>{item.shortLabel}</button>)}
      </div>
      <div id="screenshot-panel" role="tabpanel" aria-labelledby={`screenshot-tab-${active}`} className="gallery-panel" tabIndex={0}>
        <div className="screenshot-frame">
          <div className="window-toolbar"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><span>Assistive Control</span><button type="button" ref={zoomButton} aria-label={`Enlarge ${selected.shortLabel} screenshot`} onClick={() => dialog.current?.showModal()}><Icon name="zoom" size={17} /></button></div>
          <Image src={selected.src} alt={selected.alt} width={selected.width} height={selected.height} sizes="(max-width: 760px) 100vw, 900px" className="app-screenshot" />
        </div>
        <div className="screenshot-caption"><div><h3>{selected.title}</h3><p>{selected.description}</p></div><span className="capture-label"><span className="status-dot" />Actual app screenshot</span></div>
      </div>
      <p className="screenshot-note">Captured from the application with an example profile. Movements and scores are illustrative; your calibration will be different. No personal camera footage is shown.</p>
      <dialog ref={dialog} className="screenshot-dialog" aria-label={`${selected.shortLabel} screenshot, enlarged`} onClose={() => zoomButton.current?.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="dialog-toolbar"><span>{selected.shortLabel} · Assistive Control</span><button type="button" aria-label="Close enlarged screenshot" autoFocus onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
        <Image src={selected.src} alt={selected.alt} width={selected.width} height={selected.height} sizes="95vw" />
      </dialog>
    </>
  );
}
