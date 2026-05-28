let muzzleFlashUntil = 0;

export function triggerMuzzleFlash(durationMs = 70): void {
  muzzleFlashUntil = Date.now() + durationMs;
}

export function isMuzzleFlashActive(now = Date.now()): boolean {
  return now < muzzleFlashUntil;
}
