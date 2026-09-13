import type { CSSProperties } from "react";

const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  external: "M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  windows: "M3 5l8-1v8H3V5Zm10-1 8-1v9h-8V4ZM3 14h8v7l-8-1v-6Zm10 0h8v8l-8-1v-7Z",
  camera: "M8 6l2-3h4l2 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  cursor: "m5 3 14 9-7 1-3 7L5 3Zm7 10 5 7",
  check: "m5 12 4 4L19 6",
  shield: "M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Zm-4 9 3 3 5-6",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M5 10h14v11H5V10Zm7 5v2",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  hand: "M8 11V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 8-7 8-3 0-5-2-7-4l-3-4a2 2 0 0 1 3-3l2 2",
  refresh: "M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2",
  monitor: "M3 4h18v13H3V4Zm5 17h8m-4-4v4",
  usb: "M12 3v14m-3-11 3-3 3 3M7 9v3l5 3m5-7v4l-5 3m-2 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM5 7h4v2H5V7Zm10-2h4v3h-4V5Z",
  scroll: "M12 3v18m-4-4 4 4 4-4M8 7l4-4 4 4",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  zoom: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  chevron: "m9 5 7 7-7 7",
  heart: "M12 21S3 15 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 13-9 13Z",
  github: "M9 19c-4 1-4-2-6-2m12 5v-4c0-1 .1-2-.5-2.5 3.5-.4 7-1.7 7-6A5 5 0 0 0 20 6c.2-1 .1-2-.5-3-2-.5-4 1-4 1a13 13 0 0 0-7 0s-2-1.5-4-1C4 4 4 5 4.5 6A5 5 0 0 0 3 9.5c0 4.3 3.5 5.6 7 6-.6.5-.5 1.5-.5 2.5v4",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={paths[name]} />
    </svg>
  );
}
