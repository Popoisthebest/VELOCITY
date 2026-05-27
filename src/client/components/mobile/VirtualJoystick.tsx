import React, { useRef, useEffect } from "react";

type Props = {
  onMove: (x: number, y: number) => void; // -1..1
  size?: number;
};

export function VirtualJoystick({ onMove, size = 140 }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

    const onStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        activeId.current = t.identifier;
        const rect = el.getBoundingClientRect();
        origin.current = { x: t.clientX, y: t.clientY };
        e.preventDefault();
        break;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (activeId.current === null) return;
      const t = Array.from(e.touches).find(
        (tt) => tt.identifier === activeId.current,
      );
      if (!t) return;
      const dx = t.clientX - origin.current.x;
      const dy = t.clientY - origin.current.y;
      const r = size / 2;
      const nx = clamp(dx / r);
      const ny = clamp(-dy / r); // up is positive
      (window as any).requestAnimationFrame(() => onMoveCallback(nx, ny));
      e.preventDefault();
    };

    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeId.current) {
          activeId.current = null;
          (window as any).requestAnimationFrame(() => onMoveCallback(0, 0));
          e.preventDefault();
          break;
        }
      }
    };

    const onMoveCallback = (x: number, y: number) => {
      onMove(x, y);
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: false });
    window.addEventListener("touchcancel", onEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onMove, size]);

  return (
    <div
      ref={elRef}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: "rgba(0,0,0,0.12)",
        border: "1px solid rgba(255,255,255,0.06)",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    />
  );
}

export default VirtualJoystick;
