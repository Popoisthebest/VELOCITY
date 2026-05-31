// ========================================
// Client-Side Game State Store
// Powered by Zustand
// ========================================

import { create } from "zustand";
import { GamePhase } from "@shared/types/index.js";
import type {
  PlayerState,
  KillEvent,
  MapData,
  RoomInfo,
} from "@shared/types/index.js";

export type GraphicsQuality = "low" | "medium" | "high";

type WinnerInfo = { id: string; nickname: string; kills: number };

export interface RttMetrics {
  current: number;
  avg: number;
  min: number;
  max: number;
}

export interface SnapshotDebugMetrics {
  interval: number;
  avg: number;
  max: number;
}

export interface InterpolationDebugMetrics {
  trackedPlayers: number;
  extrapolationCount: number;
  snapCount: number;
  lastPlayerId: string | null;
  correctionError: number;
  velocityMagnitude: number;
  extrapolating: boolean;
  updatedAt: number;
}

export interface ServerDebugMetrics {
  tickInterval: number;
  tickAvg: number;
  tickMax: number;
  tickDrift: number;
  snapshotInterval: number;
  snapshotAvg: number;
  snapshotMax: number;
  snapshotDrift: number;
  updatedAt: number;
}

export interface NetworkDebugMetrics {
  rtt: RttMetrics;
  snapshot: SnapshotDebugMetrics;
  interpolation: InterpolationDebugMetrics;
  server: ServerDebugMetrics | null;
}

const createInitialNetworkDebugMetrics = (): NetworkDebugMetrics => ({
  rtt: { current: 0, avg: 0, min: 0, max: 0 },
  snapshot: { interval: 0, avg: 0, max: 0 },
  interpolation: {
    trackedPlayers: 0,
    extrapolationCount: 0,
    snapCount: 0,
    lastPlayerId: null,
    correctionError: 0,
    velocityMagnitude: 0,
    extrapolating: false,
    updatedAt: 0,
  },
  server: null,
});

interface GameStore {
  // Connection
  connected: boolean;
  playerId: string | null;
  roomId: string | null;
  nickname: string;
  rooms: RoomInfo[];

  // Local player
  localPlayer: PlayerState | null;

  // Remote players (rendered/interpolated)
  remotePlayers: Map<string, PlayerState>;

  // Game state
  gamePhase: GamePhase;
  timeRemaining: number;
  killLimit: number;

  // HUD
  killFeed: (KillEvent & { id: string; fadeOut?: boolean })[];
  hitMarker: boolean;
  hitMarkerTimeout: NodeJS.Timeout | null;
  damageNumbers: {
    id: string;
    damage: number;
    headshot: boolean;
    createdAt: number;
  }[];

  // Scoreboard
  showScoreboard: boolean;

  // Network metrics
  ping: number;
  fps: number;
  networkDebug: NetworkDebugMetrics;

  // Map
  mapData: MapData | null;

  // UI state
  inGame: boolean;
  isDead: boolean;
  respawnTime: number;

  // Winner info
  winner: WinnerInfo | null;

  // Settings
  graphicsQuality: GraphicsQuality;
  volume: number;

  // Actions
  setConnected(connected: boolean): void;
  setPlayerId(id: string): void;
  setRoomId(id: string): void;
  setNickname(name: string): void;
  setRooms(rooms: RoomInfo[]): void;
  setLocalPlayer(player: PlayerState | null): void;
  updateLocalPlayer(partial: Partial<PlayerState>): void;
  setRemotePlayers(players: Map<string, PlayerState>): void;
  addRemotePlayer(player: PlayerState): void;
  updateRemotePlayerMetadata(player: PlayerState): void;
  removeRemotePlayer(id: string): void;
  setGamePhase(
    phase: GamePhase,
    timeRemaining: number,
    winner?: WinnerInfo,
  ): void;
  setMatchState(
    phase: GamePhase,
    timeRemaining: number,
    killLimit: number,
  ): void;
  addKillEvent(event: KillEvent): void;
  triggerHitMarker(): void;
  setShowScoreboard(show: boolean): void;
  setPing(ping: number): void;
  setFps(fps: number): void;
  setRttMetrics(metrics: RttMetrics): void;
  setSnapshotMetrics(metrics: SnapshotDebugMetrics): void;
  setInterpolationMetrics(metrics: InterpolationDebugMetrics): void;
  setServerDebugMetrics(metrics: ServerDebugMetrics): void;
  addDamageNumber(damage: number, headshot: boolean): void;
  setMapData(map: MapData): void;
  setInGame(inGame: boolean): void;
  setDead(isDead: boolean, respawnTime: number): void;
  setGraphicsQuality(quality: GraphicsQuality): void;
  setVolume(volume: number): void;
  reset(): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  playerId: null,
  roomId: null,
  nickname: "",
  rooms: [],
  localPlayer: null,
  remotePlayers: new Map(),
  gamePhase: GamePhase.WAITING,
  timeRemaining: 0,
  killLimit: 30,
  killFeed: [],
  hitMarker: false,
  hitMarkerTimeout: null,
  damageNumbers: [],
  showScoreboard: false,
  ping: 0,
  fps: 60,
  networkDebug: createInitialNetworkDebugMetrics(),
  mapData: null,
  inGame: false,
  isDead: false,
  respawnTime: 0,
  winner: null,
  graphicsQuality: "high",
  volume: 0.8,

  setConnected: (connected) => set({ connected }),
  setPlayerId: (playerId) => set({ playerId }),
  setRoomId: (roomId) => set({ roomId }),
  setNickname: (nickname) => set({ nickname }),
  setRooms: (rooms) => set({ rooms }),
  setLocalPlayer: (localPlayer) => set({ localPlayer }),
  updateLocalPlayer: (partial) =>
    set((state) => ({
      localPlayer: state.localPlayer
        ? { ...state.localPlayer, ...partial }
        : null,
    })),
  setRemotePlayers: (remotePlayers) => set({ remotePlayers }),
  addRemotePlayer: (player) =>
    set((state) => {
      const newMap = new Map(state.remotePlayers);
      newMap.set(player.id, player);
      return { remotePlayers: newMap };
    }),
  updateRemotePlayerMetadata: (player) =>
    set((state) => {
      const current = state.remotePlayers.get(player.id);
      if (!current) {
        const newMap = new Map(state.remotePlayers);
        newMap.set(player.id, player);
        return { remotePlayers: newMap };
      }

      const changed =
        current.nickname !== player.nickname ||
        current.health !== player.health ||
        current.armor !== player.armor ||
        current.alive !== player.alive ||
        current.weapon !== player.weapon ||
        current.ammo !== player.ammo ||
        current.maxAmmo !== player.maxAmmo ||
        current.reloading !== player.reloading ||
        current.kills !== player.kills ||
        current.deaths !== player.deaths ||
        current.assists !== player.assists ||
        current.score !== player.score ||
        current.streak !== player.streak;

      if (!changed) return state;

      const newMap = new Map(state.remotePlayers);
      newMap.set(player.id, {
        ...current,
        nickname: player.nickname,
        health: player.health,
        armor: player.armor,
        alive: player.alive,
        weapon: player.weapon,
        ammo: player.ammo,
        maxAmmo: player.maxAmmo,
        reloading: player.reloading,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        score: player.score,
        streak: player.streak,
      });
      return { remotePlayers: newMap };
    }),
  removeRemotePlayer: (id) =>
    set((state) => {
      const newMap = new Map(state.remotePlayers);
      newMap.delete(id);
      return { remotePlayers: newMap };
    }),
  setGamePhase: (gamePhase, timeRemaining, winner) =>
    set((state) => ({
      gamePhase,
      timeRemaining,
      winner:
        gamePhase === "ended"
          ? winner !== undefined
            ? winner
            : state.winner
          : null,
    })),
  setMatchState: (gamePhase, timeRemaining, killLimit) =>
    set((state) => ({
      gamePhase,
      timeRemaining,
      killLimit,
      winner: gamePhase === "ended" ? state.winner : null,
    })),
  addKillEvent: (event) =>
    set((state) => {
      const eventId = Math.random().toString(36).substring(2, 9);
      const newEvent = { ...event, id: eventId };
      const currentFeed = [...state.killFeed, newEvent];

      // Limit to 5 entries
      if (currentFeed.length > 5) {
        currentFeed.shift();
      }

      // Schedule removal after 4 seconds
      setTimeout(() => {
        set((s) => {
          // Set fadeout first
          const updated = s.killFeed.map((item) =>
            item.id === eventId ? { ...item, fadeOut: true } : item,
          );
          return { killFeed: updated };
        });

        // Actually remove after fadeout animation (500ms)
        setTimeout(() => {
          set((s) => ({
            killFeed: s.killFeed.filter((item) => item.id !== eventId),
          }));
        }, 500);
      }, 4000);

      return { killFeed: currentFeed };
    }),
  triggerHitMarker: () => {
    const currentTimeout = get().hitMarkerTimeout;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    const timeout = setTimeout(() => {
      set({ hitMarker: false, hitMarkerTimeout: null });
    }, 200);

    set({ hitMarker: true, hitMarkerTimeout: timeout });
  },
  setShowScoreboard: (showScoreboard) => set({ showScoreboard }),
  setPing: (ping) =>
    set((state) => ({
      // EMA Smoothing: NewValue = OldValue * 0.9 + Sample * 0.1
      // If old ping is 0, just set it to current sample
      ping: state.ping === 0 ? ping : Math.round(state.ping * 0.9 + ping * 0.1),
    })),
  setFps: (fps) => set({ fps }),
  setRttMetrics: (rtt) =>
    set((state) => ({
      networkDebug: { ...state.networkDebug, rtt },
    })),
  setSnapshotMetrics: (snapshot) =>
    set((state) => ({
      networkDebug: { ...state.networkDebug, snapshot },
    })),
  setInterpolationMetrics: (interpolation) =>
    set((state) => ({
      networkDebug: { ...state.networkDebug, interpolation },
    })),
  setServerDebugMetrics: (server) =>
    set((state) => ({
      networkDebug: { ...state.networkDebug, server },
    })),
  addDamageNumber: (damage, headshot) => {
    const id = Math.random().toString(36).substring(2, 9);
    const entry = { id, damage, headshot, createdAt: Date.now() };
    set((state) => ({ damageNumbers: [...state.damageNumbers, entry] }));

    setTimeout(() => {
      set((state) => ({
        damageNumbers: state.damageNumbers.filter((item) => item.id !== id),
      }));
    }, 1100);
  },
  setMapData: (mapData) => set({ mapData }),
  setInGame: (inGame) => set({ inGame }),
  setDead: (isDead, respawnTime) => set({ isDead, respawnTime }),
  setGraphicsQuality: (graphicsQuality) => set({ graphicsQuality }),
  setVolume: (volume) => set({ volume }),
  reset: () =>
    set({
      roomId: null,
      localPlayer: null,
      remotePlayers: new Map(),
      gamePhase: GamePhase.WAITING,
      timeRemaining: 0,
      killFeed: [],
      hitMarker: false,
      damageNumbers: [],
      winner: null,
      inGame: false,
      isDead: false,
      respawnTime: 0,
      ping: 0,
      networkDebug: createInitialNetworkDebugMetrics(),
    }),
}));
