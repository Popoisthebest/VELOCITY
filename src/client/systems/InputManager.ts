// ========================================
// Client-Side Input Manager
// Accumulates mouse movements and key states
// ========================================

import type { InputState } from "@shared/types/index.js";
import { useGameStore } from "../store/gameStore.js";

export class InputManager {
  private static instance: InputManager | null = null;

  private keys = new Map<string, boolean>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private sensitivity = 0.002;
  private touchSensitivity = 0.006;

  // Touch / mobile input state
  private touchMoveX = 0; // -1..1 (left/right)
  private touchMoveY = 0; // -1..1 (forward/back)
  private touchLookDX = 0;
  private touchLookDY = 0;
  private touchFire = false;
  private touchJump = false;
  private touchCrouch = false;
  private touchSprint = false;
  private touchReload = false;

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

  // -----------------
  // Touch API (called by mobile UI overlay)
  // -----------------
  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  public onTouchLook(dx: number, dy: number): void {
    this.touchLookDX += dx;
    this.touchLookDY += dy;
  }

  public setTouchFire(v: boolean): void {
    this.touchFire = v;
  }
  public setTouchJump(v: boolean): void {
    this.touchJump = v;
  }
  public setTouchCrouch(v: boolean): void {
    this.touchCrouch = v;
  }
  public setTouchSprint(v: boolean): void {
    this.touchSprint = v;
  }
  public setTouchReload(v: boolean): void {
    this.touchReload = v;
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

    // Apply touch look deltas (if any)
    if (this.touchLookDX !== 0 || this.touchLookDY !== 0) {
      this.yaw -= this.touchLookDX * this.touchSensitivity;
      this.pitch -= this.touchLookDY * this.touchSensitivity;
      // reset accumulators
      this.touchLookDX = 0;
      this.touchLookDY = 0;
    }

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
      forward:
        this.keys.get("KeyW") ||
        this.keys.get("ArrowUp") ||
        this.touchMoveY > 0.3 ||
        false,
      backward:
        this.keys.get("KeyS") ||
        this.keys.get("ArrowDown") ||
        this.touchMoveY < -0.3 ||
        false,
      left:
        this.keys.get("KeyA") ||
        this.keys.get("ArrowLeft") ||
        this.touchMoveX < -0.3 ||
        false,
      right:
        this.keys.get("KeyD") ||
        this.keys.get("ArrowRight") ||
        this.touchMoveX > 0.3 ||
        false,
      jump: this.keys.get("Space") || this.touchJump || false,
      sprint:
        this.keys.get("ShiftLeft") ||
        this.keys.get("ShiftRight") ||
        this.touchSprint ||
        false,
      crouch:
        this.keys.get("KeyC") ||
        this.keys.get("ControlLeft") ||
        this.touchCrouch ||
        false,
      shoot: this.keys.get("MouseLeft") || this.touchFire || false,
      reload: this.keys.get("KeyR") || this.touchReload || false,
      yaw: this.yaw,
      pitch: this.pitch,
      sequence,
      deltaTime,
      ping: useGameStore.getState().ping,
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
