import React, { useRef, useEffect } from "react";

type Props = {
  onPress: () => void;
  onRelease?: () => void;
  label?: string;
  size?: number;
};

export function TouchButton({ onPress, onRelease, label, size = 64 }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      onPress();
    };
    const end = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (onRelease) onRelease();
    };

    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("mousedown", start);
    window.addEventListener("touchend", end, { passive: false });
    window.addEventListener("mouseup", end);

    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("mousedown", start);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mouseup", end);
    };
  }, [onPress, onRelease]);

  return (
    <button
      ref={ref}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontWeight: 700,
        touchAction: "none",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

export default TouchButton;
