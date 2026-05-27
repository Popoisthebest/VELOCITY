// Device capability detection utilities
export function isTouchDevice(): boolean {
  try {
    const hasTouch =
      typeof navigator !== "undefined" &&
      "maxTouchPoints" in navigator &&
      (navigator as any).maxTouchPoints > 0;
    const coarse =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;
    const small = typeof window !== "undefined" && window.innerWidth <= 1024;
    return !!(hasTouch || coarse || small);
  } catch (err) {
    return false;
  }
}

export function isMobileOrTablet(): boolean {
  return isTouchDevice();
}

export function getInputMode(): "desktop" | "touch" {
  return isTouchDevice() ? "touch" : "desktop";
}
