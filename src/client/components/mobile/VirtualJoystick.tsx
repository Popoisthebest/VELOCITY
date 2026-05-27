import React, { useRef, useEffect, useState } from "react";

type Props = {
  onMove: (x: number, y: number) => void; // -1..1
  size?: number;
};

export function VirtualJoystick({ onMove, size = 140 }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const activeId = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });
  const radius = size / 2;
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));

    const onPointerDown = (e: PointerEvent) => {
      if (activeId.current !== null) return;
      activeId.current = e.pointerId;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      center.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateFromPoint(e.clientX, e.clientY);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId.current) return;
      updateFromPoint(e.clientX, e.clientY);
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId.current) return;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {}
      activeId.current = null;
      setKnob({ x: 0, y: 0 });
      onMove(0, 0);
      e.preventDefault();
    };

    const updateFromPoint = (px: number, py: number) => {
      const dx = px - center.current.x;
      const dy = py - center.current.y;
      const dist = Math.hypot(dx, dy);
      const clamped = dist > radius ? radius / dist : 1;
      const ndx = dx * clamped;
      const ndy = dy * clamped;

      // normalized -1..1
      let nx = ndx / radius;
      let ny = -ndy / radius; // up positive

      // prevent diagonal speed boost by normalizing magnitude
      const mag = Math.hypot(nx, ny);
      if (mag > 1) {
        nx /= mag;
        ny /= mag;
      }

      setKnob({ x: ndx, y: ndy });
      onMove(nx, ny);
    };

    el.addEventListener("pointerdown", onPointerDown as any);
    window.addEventListener("pointermove", onPointerMove as any);
    window.addEventListener("pointerup", onPointerUp as any);
    window.addEventListener("pointercancel", onPointerUp as any);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown as any);
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("pointerup", onPointerUp as any);
      window.removeEventListener("pointercancel", onPointerUp as any);
    };
  }, [onMove, radius]);

  return (
    <div
      className="virtual-joystick"
      ref={elRef}
      style={{ width: size, height: size }}
    >
      <div className="joystick-base" style={{ width: size, height: size }} />
      <div
        className="joystick-knob"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
        }}
      />
    </div>
  );
}

export default VirtualJoystick;
