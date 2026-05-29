// ========================================
// Client-Side WebSocket Network client
// Manages real-time connection, reconnections, ping, and dispatches packets
// ========================================

import {
  decodePacket,
  encodePacket,
  PacketType,
} from "@shared/protocol/index.js";
import type { ClientPacket, ServerPacket } from "@shared/protocol/index.js";
import type { PlayerState } from "@shared/types/index.js";
import {
  DEBUG_LOG_INTERVAL,
  DEBUG_PING_INTERVAL,
  DEBUG_WARNING_THROTTLE,
  SNAPSHOT_INTERVAL_WARNING,
} from "@shared/constants/index.js";
import { useGameStore } from "../store/gameStore.js";
import { predictionSystem } from "../systems/PredictionSystem.js";
import { interpolationSystem } from "../systems/InterpolationSystem.js";
import { inputManager } from "../systems/InputManager.js";
import { audioManager } from "../systems/AudioManager.js";

export class NetworkClient {
  private static instance: NetworkClient | null = null;
  private ws: WebSocket | null = null;
  private url = "";
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly maxMetricSamples = 120;
  private rttSamples: number[] = [];
  private snapshotIntervalSamples: number[] = [];
  private lastSnapshotArrivalTime: number | null = null;
  private lastRttLogTime = 0;
  private lastSnapshotLogTime = 0;
  private lastSnapshotWarningTime = 0;

  constructor() {}

  public static getInstance(): NetworkClient {
    if (!NetworkClient.instance) {
      NetworkClient.instance = new NetworkClient();
    }
    return NetworkClient.instance;
  }

  public connect(url: string): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.url = url;
    this.isConnecting = true;
    console.log(`[NetworkClient] Connecting to ${url}...`);

    try {
      this.ws = new WebSocket(url);
      this.setupHandlers();
    } catch (err) {
      console.error("[NetworkClient] Connection error:", err);
      this.scheduleReconnect();
    }
  }

  private setupHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      if (this.ws) this.ws.binaryType = "arraybuffer";
      console.log("[NetworkClient] Connected to server");
      this.isConnecting = false;
      this.reconnectDelay = 1000;
      this.clearDebugMetrics();
      useGameStore.getState().setConnected(true);

      // Start ping loop
      this.startPingLoop();
    };

    this.ws.onmessage = (event) => {
      try {
        const packet = decodePacket(event.data) as ServerPacket;
        this.handlePacket(packet);
      } catch (err) {
        console.error("[NetworkClient] Error decoding packet:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("[NetworkClient] Connection closed");
      useGameStore.getState().setConnected(false);
      this.stopPingLoop();
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[NetworkClient] WebSocket error:", error);
    };
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.sendPing();

    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, DEBUG_PING_INTERVAL);
  }

  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: PacketType.C_PING, timestamp: performance.now() });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    console.log(`[NetworkClient] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000); // Backoff up to 8s
      this.connect(this.url);
    }, this.reconnectDelay);
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPingLoop();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on explicit disconnect
      this.ws.close();
      this.ws = null;
    }

    useGameStore.getState().reset();
    predictionSystem.clear();
    interpolationSystem.clear();
    console.log("[NetworkClient] Explicitly disconnected");
  }

  public send(packet: ClientPacket): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodePacket(packet));
    }
  }

  public requestRoomList(): void {
    this.send({ type: PacketType.C_ROOM_LIST });
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handlePacket(packet: ServerPacket): void {
    const store = useGameStore.getState();

    switch (packet.type) {
      case PacketType.S_JOIN_ACK: {
        interpolationSystem.clear();
        store.setPlayerId(packet.playerId);
        store.setRoomId(packet.roomId);
        store.setMapData(packet.map);
        store.setGamePhase(packet.state.phase, packet.state.timeRemaining);

        // Populate players
        const remoteMap = new Map<string, PlayerState>();
        const joinSnapshotTime = Date.now();
        for (const [id, state] of Object.entries(packet.state.players)) {
          if (id === packet.playerId) {
            store.setLocalPlayer(state);
          } else {
            interpolationSystem.addSnapshot(id, state, joinSnapshotTime);
            remoteMap.set(id, state);
          }
        }
        store.setRemotePlayers(remoteMap);
        store.setInGame(true);
        console.log("[NetworkClient] Joined room successfully:", packet.roomId);
        break;
      }

      case PacketType.S_PLAYER_JOINED: {
        if (packet.player.id !== store.playerId) {
          interpolationSystem.addSnapshot(
            packet.player.id,
            packet.player,
            Date.now(),
          );
          store.addRemotePlayer(packet.player);
        }
        break;
      }

      case PacketType.S_PLAYER_LEFT: {
        store.removeRemotePlayer(packet.playerId);
        interpolationSystem.removePlayer(packet.playerId);
        break;
      }

      case PacketType.S_SNAPSHOT: {
        this.recordSnapshotArrival();

        // Update match state from server
        if (packet.match) {
          store.setMatchState(
            packet.match.phase,
            packet.match.timeRemaining,
            packet.match.killLimit,
          );
        }

        const localId = store.playerId;
        if (!localId) return;

        const serverPlayers = packet.players;
        const lastProcessedInput = packet.lastProcessedInput;

        // 1. Process local player prediction / reconciliation
        const localServerState = serverPlayers[localId];
        const localPlayer = store.localPlayer;

        if (localServerState && localPlayer) {
          if (localServerState.alive) {
            // Reconcile client prediction
            const mapBoxes = store.mapData?.boxes || [];
            const reconciled = predictionSystem.reconcile(
              localPlayer,
              localServerState,
              lastProcessedInput[localId] || 0,
              mapBoxes,
            );

            // Update local player with reconciled movement + server authoritative stats (ammo, health, armor, kills, deaths)
            store.setLocalPlayer({
              ...localServerState,
              position: reconciled.position,
              velocity: reconciled.velocity,
              grounded: reconciled.grounded,
              // Keep local rotation so look controls don't jump!
              rotation: localPlayer.rotation,
            });
          } else {
            // Just snap to server state if dead
            store.setLocalPlayer(localServerState);
          }
        }

        // 2. Process remote players for render smoothing. Keep store authoritative
        // to the latest server snapshot; RemotePlayer reads smoothed render state
        // directly from InterpolationSystem each frame.
        const remotePlayersMap = new Map<string, PlayerState>();

        for (const [id, state] of Object.entries(serverPlayers)) {
          if (id === localId) continue;

          interpolationSystem.addSnapshot(id, state, packet.timestamp);
          remotePlayersMap.set(id, state);
        }

        store.setRemotePlayers(remotePlayersMap);
        break;
      }

      case PacketType.S_HIT_CONFIRM: {
        store.triggerHitMarker();
        store.addDamageNumber(packet.hit.damage, packet.hit.headshot);
        audioManager.playHit();
        break;
      }

      case PacketType.S_KILL: {
        store.addKillEvent(packet.kill);
        if (packet.kill.killerId === store.playerId) {
          audioManager.playKill();
        }
        break;
      }

      case PacketType.S_DEATH: {
        store.setDead(true, packet.respawnTime);
        audioManager.playDeath();
        if (store.localPlayer) {
          store.updateLocalPlayer({ alive: false });
        }
        break;
      }

      case PacketType.S_SPAWN: {
        store.setDead(false, 0);
        if (store.localPlayer) {
          store.updateLocalPlayer({
            alive: true,
            position: packet.position,
            rotation: packet.rotation,
            velocity: { x: 0, y: 0, z: 0 },
            aiming: false,
          });
        }
        // Force reset input manager yaw/pitch to match spawn point rotation
        inputManager.yaw = packet.rotation.yaw;
        inputManager.pitch = packet.rotation.pitch;
        break;
      }

      case PacketType.S_GAME_PHASE: {
        store.setGamePhase(packet.phase, packet.timeRemaining, packet.winner);
        break;
      }

      case PacketType.S_ROOM_LIST: {
        store.setRooms(packet.rooms);
        break;
      }

      case PacketType.S_PONG: {
        const receiveTime = performance.now();
        this.recordRtt(receiveTime - packet.timestamp);
        interpolationSystem.updateClockOffset(
          packet.serverTime,
          packet.timestamp,
          receiveTime,
        );
        break;
      }

      case PacketType.S_DEBUG_STATS: {
        store.setServerDebugMetrics({
          tickInterval: packet.tick.interval,
          tickAvg: packet.tick.avg,
          tickMax: packet.tick.max,
          tickDrift: packet.tick.drift,
          snapshotInterval: packet.snapshot.interval,
          snapshotAvg: packet.snapshot.avg,
          snapshotMax: packet.snapshot.max,
          snapshotDrift: packet.snapshot.drift,
          updatedAt: packet.timestamp,
        });
        break;
      }

      case PacketType.S_ERROR: {
        console.error(
          "[NetworkClient] Server error packet received:",
          packet.message,
        );
        window.dispatchEvent(
          new CustomEvent("game:error", { detail: packet.message }),
        );
        break;
      }

      default:
        console.warn(
          "[NetworkClient] Unhandled server packet:",
          (packet as { type: unknown }).type,
        );
    }
  }

  private recordRtt(rawRtt: number): void {
    const current = Math.max(0, Math.round(rawRtt));
    this.addMetricSample(this.rttSamples, current);

    const metrics = {
      current,
      avg: this.average(this.rttSamples),
      min: Math.min(...this.rttSamples),
      max: Math.max(...this.rttSamples),
    };

    const store = useGameStore.getState();
    store.setPing(current);
    store.setRttMetrics(metrics);

    const now = performance.now();
    if (now - this.lastRttLogTime >= DEBUG_LOG_INTERVAL) {
      this.lastRttLogTime = now;
      console.log(
        `[NET RTT] current=${metrics.current}ms avg=${metrics.avg}ms min=${metrics.min}ms max=${metrics.max}ms`,
      );
    }
  }

  private recordSnapshotArrival(): void {
    const now = performance.now();
    if (this.lastSnapshotArrivalTime === null) {
      this.lastSnapshotArrivalTime = now;
      return;
    }

    const interval = Math.round(now - this.lastSnapshotArrivalTime);
    this.lastSnapshotArrivalTime = now;
    this.addMetricSample(this.snapshotIntervalSamples, interval);

    const metrics = {
      interval,
      avg: this.average(this.snapshotIntervalSamples),
      max: Math.max(...this.snapshotIntervalSamples),
    };

    useGameStore.getState().setSnapshotMetrics(metrics);

    if (now - this.lastSnapshotLogTime >= DEBUG_LOG_INTERVAL) {
      this.lastSnapshotLogTime = now;
      console.log(
        `[SNAPSHOT] interval=${metrics.interval}ms avg=${metrics.avg}ms max=${metrics.max}ms`,
      );
    }

    if (
      interval >= SNAPSHOT_INTERVAL_WARNING &&
      now - this.lastSnapshotWarningTime >= DEBUG_WARNING_THROTTLE
    ) {
      this.lastSnapshotWarningTime = now;
      console.warn(`[SNAPSHOT WARNING] interval spike detected: ${interval}ms`);
    }
  }

  private addMetricSample(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > this.maxMetricSamples) {
      samples.shift();
    }
  }

  private average(samples: number[]): number {
    if (samples.length === 0) return 0;
    return Math.round(
      samples.reduce((total, value) => total + value, 0) / samples.length,
    );
  }

  private clearDebugMetrics(): void {
    this.rttSamples = [];
    this.snapshotIntervalSamples = [];
    this.lastSnapshotArrivalTime = null;
    this.lastRttLogTime = 0;
    this.lastSnapshotLogTime = 0;
    this.lastSnapshotWarningTime = 0;
  }
}
export const networkClient = NetworkClient.getInstance();
