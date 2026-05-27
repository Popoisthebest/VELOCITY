import React, { useCallback, useEffect, useRef, useState } from "react";
import VirtualJoystick from "./VirtualJoystick";
import TouchButton from "./TouchButton";
import { inputManager } from "../../systems/InputManager.js";
import { getInputMode } from "../../utils/device.js";

function shouldForceTouch(): boolean {
  try {
    const qp = new URLSearchParams(window.location.search);
    return qp.get("touch") === "1" || qp.get("debugTouch") === "1";
  } catch (err) {
    return false;
  }
}

export function MobileControls() {
  const mode = getInputMode();
  if (mode !== "touch" && !shouldForceTouch()) return null;

  const onMove = useCallback((x: number, y: number) => {
    inputManager.setTouchMove(x, y);
  }, []);

  // Look area handling using pointer events
  const lookPointerId = useRef<number | null>(null);
  const lastLook = useRef({ x: 0, y: 0 });

  const onLookPointerDown = (e: React.PointerEvent) => {
    // only start if right half
    if (e.clientX < window.innerWidth * 0.42) return;
    // ignore if target is control element
    const target = e.target as HTMLElement;
    if (
      target.closest &&
      (target.closest(".virtual-joystick") || target.closest(".touch-button"))
    )
      return;

    lookPointerId.current = e.pointerId;
    lastLook.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId as any);
    e.preventDefault();
  };

  const onLookPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookPointerId.current) return;
    const dx = e.clientX - lastLook.current.x;
    const dy = e.clientY - lastLook.current.y;
    lastLook.current = { x: e.clientX, y: e.clientY };
    // forward raw pixel deltas to input manager
    inputManager.onTouchLook(dx, dy);
    e.preventDefault();
  };

  const onLookPointerUp = (e: React.PointerEvent) => {
    if (e.pointerId !== lookPointerId.current) return;
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId as any);
    } catch {}
    lookPointerId.current = null;
    e.preventDefault();
  };

  // Buttons cluster positions
  return (
    <div className="mobile-controls" style={{ pointerEvents: "none" }}>
      <div
        className="virtual-joystick-wrapper"
        style={{ pointerEvents: "auto" }}
      >
        <VirtualJoystick onMove={onMove} />
      </div>

      <div
        className="look-touch-area"
        onPointerDown={onLookPointerDown}
        onPointerMove={onLookPointerMove}
        onPointerUp={onLookPointerUp}
        onPointerCancel={onLookPointerUp}
        style={{ pointerEvents: "auto" }}
      />

      <div className="mobile-buttons" style={{ pointerEvents: "auto" }}>
        <TouchButton
          label="발사"
          onPress={() => inputManager.setTouchFire(true)}
          onRelease={() => inputManager.setTouchFire(false)}
        />
        <TouchButton
          label="점프"
          onPress={() => inputManager.setTouchJump(true)}
          onRelease={() => inputManager.setTouchJump(false)}
        />
        <TouchButton
          label="슬라이드"
          onPress={() => inputManager.setTouchCrouch(true)}
          onRelease={() => inputManager.setTouchCrouch(false)}
        />
        <TouchButton
          label="재장전"
          onPress={() => inputManager.setTouchReload(true)}
          onRelease={() => inputManager.setTouchReload(false)}
        />
      </div>
    </div>
  );
}

export default MobileControls;
