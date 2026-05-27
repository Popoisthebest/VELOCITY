// ========================================
// Client-Side Game State Store
// Powered by Zustand
// ========================================

import { create } from "zustand";
import type {
  PlayerState,
  GamePhase,
  KillEvent,
  MapData,
  WeaponType,
} from "@shared/types/index.js";

interface GameStore {
  // Connection
  connected: boolean;
  playerId: string | null;
  roomId: string | null;
  nickname: string;

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

  // Map
  mapData: MapData | null;

  // UI state
  inGame: boolean;
  isDead: boolean;
  respawnTime: number;

  // Winner info
  winner: { id: string; nickname: string; kills: number } | null;

  // Actions
  setConnected(connected: boolean): void;
  setPlayerId(id: string): void;
  setRoomId(id: string): void;
  setNickname(name: string): void;
  setLocalPlayer(player: PlayerState | null): void;
  updateLocalPlayer(partial: Partial<PlayerState>): void;
  setRemotePlayers(players: Map<string, PlayerState>): void;
  addRemotePlayer(player: PlayerState): void;
  removeRemotePlayer(id: string): void;
  setGamePhase(phase: GamePhase, timeRemaining: number, winner?: any): void;
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
  addDamageNumber(damage: number, headshot: boolean): void;
  setMapData(map: MapData): void;
  setInGame(inGame: boolean): void;
  setDead(isDead: boolean, respawnTime: number): void;
  reset(): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  playerId: null,
  roomId: null,
  nickname: "",
  localPlayer: null,
  remotePlayers: new Map(),
  gamePhase: "waiting",
  timeRemaining: 0,
  killLimit: 30,
  killFeed: [],
  hitMarker: false,
  hitMarkerTimeout: null,
  damageNumbers: [],
  showScoreboard: false,
  ping: 0,
  fps: 60,
  mapData: null,
  inGame: false,
  isDead: false,
  respawnTime: 0,
  winner: null,

  setConnected: (connected) => set({ connected }),
  setPlayerId: (playerId) => set({ playerId }),
  setRoomId: (roomId) => set({ roomId }),
  setNickname: (nickname) => set({ nickname }),
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
      winner: winner !== undefined ? winner : state.winner,
    })),
  setMatchState: (gamePhase, timeRemaining, killLimit) =>
    set({ gamePhase, timeRemaining, killLimit }),
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
  setPing: (sample) => {
    if (!Number.isFinite(sample) || sample < 0 || sample > 5000) return;
    set((state) => ({
      // EMA Smoothing: NewValue = OldValue * 0.8 + Sample * 0.2
      ping:
        state.ping === 0 ? sample : Math.round(state.ping * 0.8 + sample * 0.2),
    }));
  },
  setFps: (fps) => set({ fps }),
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
  reset: () =>
    set({
      roomId: null,
      localPlayer: null,
      remotePlayers: new Map(),
      gamePhase: "waiting",
      timeRemaining: 0,
      killFeed: [],
      hitMarker: false,
      damageNumbers: [],
      winner: null,
      inGame: false,
      isDead: false,
      respawnTime: 0,
    }),
}));
