import type { WeaponType } from "@shared/types/index.js";

type BrowserWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.8;

  public setMasterVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  public ensureStarted(): void {
    const context = this.getContext();
    if (context?.state === "suspended") {
      void context.resume();
    }
  }

  public playShoot(weapon: WeaponType): void {
    const profiles: Record<
      WeaponType,
      { frequency: number; duration: number }
    > = {
      assault_rifle: { frequency: 140, duration: 0.055 },
      smg: { frequency: 180, duration: 0.04 },
      sniper: { frequency: 90, duration: 0.12 },
      shotgun: { frequency: 75, duration: 0.14 },
      revolver: { frequency: 115, duration: 0.09 },
    };
    const profile = profiles[weapon];
    this.playNoise(profile.duration, 0.22, profile.frequency);
    this.playTone(profile.frequency * 1.8, profile.duration * 0.7, 0.08);
  }

  public playHit(): void {
    this.playTone(880, 0.06, 0.08);
  }

  public playKill(): void {
    this.playTone(660, 0.07, 0.08);
    window.setTimeout(() => this.playTone(990, 0.09, 0.08), 70);
  }

  public playDeath(): void {
    this.playTone(180, 0.18, 0.11);
    window.setTimeout(() => this.playTone(110, 0.24, 0.09), 110);
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.context) return this.context;

    const AudioContextClass =
      window.AudioContext || (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextClass) return null;

    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  private playTone(frequency: number, duration: number, gain: number): void {
    const context = this.getContext();
    if (!context || !this.masterGain) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.55),
      now + duration,
    );

    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(envelope);
    envelope.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playNoise(
    duration: number,
    gain: number,
    filterFrequency: number,
  ): void {
    const context = this.getContext();
    if (!context || !this.masterGain) return;

    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const now = context.currentTime;

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency * 18;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.masterGain);
    source.start(now);
    source.stop(now + duration);
  }
}

export const audioManager = new AudioManager();
