"use client";

import { useEffect, useRef } from "react";

type Slice = {
  x: string; // left offset, kept inside the side gutters
  y: string;
  size: number;
  rot: number;
  kind: "fill" | "line" | "accent";
  depth: number; // parallax strength in px
  dur: number;
  delay: number;
};

// Quarter plates from the logo, scattered in the desktop gutters.
const SLICES: Slice[] = [
  { x: "3%", y: "12%", size: 72, rot: 0, kind: "fill", depth: 14, dur: 19, delay: -4 },
  { x: "8.5%", y: "38%", size: 40, rot: 90, kind: "line", depth: 24, dur: 15, delay: -9 },
  { x: "2.5%", y: "62%", size: 96, rot: 180, kind: "line", depth: 8, dur: 23, delay: -2 },
  { x: "7%", y: "84%", size: 52, rot: 270, kind: "accent", depth: 18, dur: 17, delay: -12 },
  { x: "91%", y: "9%", size: 48, rot: 270, kind: "accent", depth: 20, dur: 16, delay: -6 },
  { x: "88.5%", y: "30%", size: 92, rot: 90, kind: "fill", depth: 9, dur: 22, delay: -14 },
  { x: "93%", y: "58%", size: 36, rot: 0, kind: "line", depth: 26, dur: 14, delay: -3 },
  { x: "89%", y: "78%", size: 70, rot: 180, kind: "fill", depth: 12, dur: 20, delay: -8 },
];

const PATH = "M4 96 V4 A92 92 0 0 1 96 96 Z";

/** Soft moving background behind the whole app. Pure decoration, hidden from assistive tech. */
export function Ambient() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // -1..1 from the centre of the window
        el.style.setProperty("--px", ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty("--py", ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="ambient" aria-hidden="true">
      <div className="ambient-orb ambient-orb-a" />
      <div className="ambient-orb ambient-orb-b" />
      <div className="ambient-orb ambient-orb-c" />
      <div className="ambient-dots hidden xl:block" />
      <div className="hidden xl:block">
        {SLICES.map((s, i) => (
          <div
            key={i}
            className="ambient-slice"
            style={
              {
                left: s.x,
                top: s.y,
                "--depth": s.depth,
                "--rot": `${s.rot}deg`,
                "--dur": `${s.dur}s`,
                "--delay": `${s.delay}s`,
              } as React.CSSProperties
            }
          >
            <svg width={s.size} height={s.size} viewBox="0 0 100 100">
              <path
                d={PATH}
                fill={s.kind === "fill" ? "var(--slice)" : s.kind === "accent" ? "var(--slice-accent)" : "none"}
                stroke={s.kind === "line" ? "var(--slice-line)" : "none"}
                strokeWidth={s.kind === "line" ? 3 : 0}
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </div>
      <div className="ambient-grain" />
    </div>
  );
}
