// ========================================
// Client-Side Input Manager
// Accumulates mouse movements and key states
// ========================================

import type { InputState } from "@shared/types/index.js";

export class InputManager {
  private static instance: InputManager | null = null;

  private keys = new Map<string, boolean>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private sensitivity = 0.002;

  // Cumulative orientation (radians)
  public yaw = 0;
  public pitch = 0;

  private isLocked = false;
  private canvasElement: HTMLCanvasElement | null = null;

  private onKeyDownBind: (e: KeyboardEvent) => void;
  private onKeyUpBind: (e: KeyboardEvent) => void;
  private onMouseMoveBind: (e: MouseEvent) => void;
  private onMouseDownBind: (e: MouseEvent) => void;
  private onMouseUpBind: (e: MouseEvent) => void;
  private onPointerLockChangeBind: () => void;

  constructor() {
    this.onKeyDownBind = (e) => this.onKeyDown(e);
    this.onKeyUpBind = (e) => this.onKeyUp(e);
    this.onMouseMoveBind = (e) => this.onMouseMove(e);
    this.onMouseDownBind = (e) => this.onMouseDown(e);
    this.onMouseUpBind = (e) => this.onMouseUp(e);
    this.onPointerLockChangeBind = () => this.onPointerLockChange();

    window.addEventListener("keydown", this.onKeyDownBind);
    window.addEventListener("keyup", this.onKeyUpBind);
    window.addEventListener("mousemove", this.onMouseMoveBind);
    window.addEventListener("mousedown", this.onMouseDownBind);
    window.addEventListener("mouseup", this.onMouseUpBind);
    document.addEventListener(
      "pointerlockchange",
      this.onPointerLockChangeBind,
    );
  }

  public static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  public setCanvas(canvas: HTMLCanvasElement): void {
    this.canvasElement = canvas;
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Prevent default scrolling keys
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    ) {
      e.preventDefault();
    }
    this.keys.set(e.code, true);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.set(e.code, false);
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.keys.set("MouseLeft", true);
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.keys.set("MouseLeft", false);
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isLocked) return;

    this.mouseDeltaX += e.movementX;
    this.mouseDeltaY += e.movementY;
  }

  private onPointerLockChange(): void {
    this.isLocked = document.pointerLockElement === this.canvasElement;
    if (!this.isLocked) {
      // Clear key inputs if player unlocks pointer (e.g. opens overlay)
      this.keys.clear();
      document.body.classList.remove("pointer-locked");
    } else {
      document.body.classList.add("pointer-locked");
    }
  }

  public requestPointerLock(): void {
    if (this.canvasElement) {
      this.canvasElement.requestPointerLock();
    }
  }

  public releasePointerLock(): void {
    document.exitPointerLock();
  }

  public setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public isPointerLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Generates input state and updates cumulative orientation
   */
  public getInputState(sequence: number, deltaTime: number): InputState {
    // Update orientation from accumulated mouse movement
    this.yaw -= this.mouseDeltaX * this.sensitivity;
    this.pitch -= this.mouseDeltaY * this.sensitivity;

    // Reset mouse accumulators
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Clamp pitch to avoid flipping over (±89 degrees, ~1.553 radians)
    const limit = (89 * Math.PI) / 180;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

    // Handle yaw wrap-around [0, 2pi]
    const twoPi = Math.PI * 2;
    this.yaw = ((this.yaw % twoPi) + twoPi) % twoPi;

    return {
      forward: this.keys.get("KeyW") || this.keys.get("ArrowUp") || false,
      backward: this.keys.get("KeyS") || this.keys.get("ArrowDown") || false,
      left: this.keys.get("KeyA") || this.keys.get("ArrowLeft") || false,
      right: this.keys.get("KeyD") || this.keys.get("ArrowRight") || false,
      jump: this.keys.get("Space") || false,
      sprint:
        this.keys.get("ShiftLeft") || this.keys.get("ShiftRight") || false,
      crouch: this.keys.get("KeyC") || this.keys.get("ControlLeft") || false,
      shoot: this.keys.get("MouseLeft") || false, // Click handles trigger pull, holds can update this
      reload: this.keys.get("KeyR") || false,
      yaw: this.yaw,
      pitch: this.pitch,
      sequence,
      deltaTime,
    };
  }

  /**
   * Allows external systems (e.g. Shooting Recoil) to kick the screen orientation
   */
  public applyRecoil(kickPitch: number, kickYaw = 0): void {
    this.pitch += kickPitch;
    this.yaw += kickYaw;
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.onKeyDownBind);
    window.removeEventListener("keyup", this.onKeyUpBind);
    window.removeEventListener("mousemove", this.onMouseMoveBind);
    window.removeEventListener("mousedown", this.onMouseDownBind);
    window.removeEventListener("mouseup", this.onMouseUpBind);
    document.removeEventListener(
      "pointerlockchange",
      this.onPointerLockChangeBind,
    );
    InputManager.instance = null;
  }
}
export const inputManager = InputManager.getInstance();
