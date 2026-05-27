import React, { useRef, useEffect, useState } from 'react';

type Props = {
  onPress: () => void;
  onRelease?: () => void;
  label?: string;
  size?: number;
};

export function TouchButton({ onPress, onRelease, label, size = 64 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      setActive(true);
      onPress();
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
      setActive(false);
      if (onRelease) onRelease();
      e.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown as any);
    window.addEventListener('pointerup', onPointerUp as any);
    window.addEventListener('pointercancel', onPointerUp as any);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as any);
      window.removeEventListener('pointerup', onPointerUp as any);
      window.removeEventListener('pointercancel', onPointerUp as any);
    };
  }, [onPress, onRelease]);

  return (
    <button
      ref={ref}
      className="touch-button"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
        color: 'white',
        fontWeight: 700,
        touchAction: 'none',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

export default TouchButton;
