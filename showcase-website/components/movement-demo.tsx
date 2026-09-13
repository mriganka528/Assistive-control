"use client";

import { useState } from "react";
import { Icon } from "./icon";

const patterns = [
  { label: "Once", result: "Left click", detail: "One deliberate movement. One click.", className: "single" },
  { label: "Twice", result: "Right click", detail: "Repeat the same movement to open more options.", className: "double" },
  { label: "Hold", result: "Confirm / Enter", detail: "Sustain that movement for a different action.", className: "hold" },
] as const;

export function MovementDemo() {
  const [active, setActive] = useState(0);
  const pattern = patterns[active];

  return (
    <div className="movement-demo">
      <div className="demo-topline"><span className="demo-label"><span className="status-dot" />ONE MOVEMENT, MORE POSSIBILITIES</span><Icon name="spark" size={18} /></div>
      <div className="signal-display" aria-hidden="true"><div className="signal-line" /><div key={active} className={`signal-pulse ${pattern.className}`}><span /><span /></div><span className="signal-rest">Rest</span><span className="signal-active">Your movement</span></div>
      <div className="pattern-buttons" aria-label="Explore example movement patterns">{patterns.map((item, index) => <button key={item.label} type="button" aria-pressed={index === active} onClick={() => setActive(index)}>{item.label}</button>)}</div>
      <div className="demo-result" aria-live="polite" aria-atomic="true"><span className="result-icon"><Icon name={active === 2 ? "check" : "cursor"} size={24} /></span><div><strong>{pattern.result}</strong><p>{pattern.detail}</p></div></div>
      <p className="demo-note">An example mapping. You choose the movements and actions that work for you in Settings.</p>
    </div>
  );
}
