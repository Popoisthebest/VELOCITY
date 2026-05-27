import React, { useCallback } from "react";
import VirtualJoystick from "./VirtualJoystick";
import TouchButton from "./TouchButton";
import { inputManager } from "../../systems/InputManager.js";
import { getInputMode } from "../../utils/device.js";

export function MobileControls() {
  // Only render on touch devices
  if (getInputMode() !== "touch") return null;

  const onMove = useCallback((x: number, y: number) => {
    inputManager.setTouchMove(x, y);
  }, []);

  // Right side: drag to look
  const onRightTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(
      e.changedTouches[0].identifier as any,
    );
  };

  const onRightTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    // Use movementX/Y approximation via touch positions delta per event is not available here.
    // Simpler: use velocity from touchmove by tracking prev positions would be better,
    // but for MVP, use touches' clientX/clientY relative to window center.
    const dx = (e.touches[0].clientX - window.innerWidth * 0.75) / 100;
    const dy = (e.touches[0].clientY - window.innerHeight * 0.5) / 100;
    inputManager.onTouchLook(dx, dy);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {/* Left joystick */}
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: 14,
          pointerEvents: "auto",
        }}
      >
        <VirtualJoystick onMove={onMove} />
      </div>

      {/* Right look area */}
      <div
        onTouchStart={onRightTouchStart}
        onTouchMove={onRightTouchMove}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "50%",
          height: "100%",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      />

      {/* Buttons cluster */}
      <div
        style={{
          position: "absolute",
          right: 14,
          bottom: 14,
          display: "flex",
          gap: 12,
          flexDirection: "column",
          pointerEvents: "auto",
        }}
      >
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
          label="앉기"
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
