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
import { createDefaultPlayerState } from "@shared/types/index.js";
import { useGameStore } from "../store/gameStore.js";
import { predictionSystem } from "../systems/PredictionSystem.js";
import { interpolationSystem } from "../systems/InterpolationSystem.js";
import { inputManager } from "../systems/InputManager.js";

export class NetworkClient {
  private static instance: NetworkClient | null = null;
  private ws: WebSocket | null = null;
  private url = "";
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPingSentTime = 0;

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
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const timestamp = Date.now();
        this.lastPingSentTime = timestamp;
        this.send({ type: PacketType.C_PING, timestamp });
      }
    }, 2000);
  }

  private stopPingLoop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
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

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handlePacket(packet: ServerPacket): void {
    const store = useGameStore.getState();

    switch (packet.type) {
      case PacketType.S_JOIN_ACK: {
        store.setPlayerId(packet.playerId);
        store.setRoomId(packet.roomId);
        store.setMapData(packet.map);
        store.setGamePhase(packet.state.phase, packet.state.timeRemaining);

        // Populate players
        const remoteMap = new Map();
        for (const [id, state] of Object.entries(packet.state.players)) {
          if (id === packet.playerId) {
            store.setLocalPlayer(state);
          } else {
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

        // 2. Process remote players for interpolation
        const remotePlayersMap = new Map<string, PlayerState>();

        for (const [id, state] of Object.entries(serverPlayers)) {
          if (id === localId) continue;

          // Buffer snapshot for interpolation
          interpolationSystem.addSnapshot(id, state, packet.timestamp);

          // Get the current interpolated state for rendering
          const renderTime = Date.now() - 100; // 100ms interpolation delay
          const interpState = interpolationSystem.getInterpolatedState(
            id,
            renderTime,
          );

          if (interpState) {
            remotePlayersMap.set(id, interpState);
          } else {
            remotePlayersMap.set(id, state); // Fallback to raw server state
          }
        }

        store.setRemotePlayers(remotePlayersMap);
        break;
      }

      case PacketType.S_HIT_CONFIRM: {
        store.triggerHitMarker();
        store.addDamageNumber(packet.hit.damage, packet.hit.headshot);
        break;
      }

      case PacketType.S_KILL: {
        store.addKillEvent(packet.kill);
        break;
      }

      case PacketType.S_DEATH: {
        store.setDead(true, packet.respawnTime);
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

      case PacketType.S_PONG: {
        const latency = Math.round(Date.now() - packet.timestamp);
        store.setPing(latency);
        break;
      }

      case PacketType.S_ERROR: {
        console.error(
          "[NetworkClient] Server error packet received:",
          packet.message,
        );
        break;
      }

      default:
        console.warn(
          "[NetworkClient] Unhandled server packet:",
          (packet as any).type,
        );
    }
  }
}
export const networkClient = NetworkClient.getInstance();
