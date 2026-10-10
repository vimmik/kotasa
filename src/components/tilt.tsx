"use client";

import { useEffect, useRef } from "react";

/**
 * Tilts its child in 3D toward the pointer (anywhere in the window).
 * Mouse/trackpad only; does nothing for touch or reduced motion.
 */
export function Tilt({ children, className = "", max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
        const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)));
        el.style.setProperty("--tilt-y", `${(dx * max).toFixed(2)}deg`);
        el.style.setProperty("--tilt-x", `${(-dy * max * 0.75).toFixed(2)}deg`);
      });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div ref={ref} className={`[perspective:1200px] ${className}`}>
      <div className="relative h-full w-full transition-transform duration-700 ease-(--ease-out-soft) [transform-style:preserve-3d] [transform:rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))]">
        {children}
      </div>
    </div>
  );
}
