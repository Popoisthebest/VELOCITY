// ========================================
// Server-Side Game Room
// Manages players, game loop, and states
// ========================================

import type {
  PlayerState,
  InputState,
  Vec3,
  SpawnPoint,
  Rotation,
} from "../../shared/types/index.js";
import { GamePhase, WeaponType } from "../../shared/types/index.js";
import { PacketType } from "../../shared/protocol/index.js";
import type { Packet, ServerPacket } from "../../shared/protocol/index.js";
import {
  TICK_INTERVAL,
  NETWORK_INTERVAL,
  RESPAWN_TIME,
  KILL_LIMIT,
  TIME_LIMIT,
  MIN_PLAYERS_TO_START,
  END_GAME_COOLDOWN,
  WEAPONS,
  BASE_KILL_SCORE,
  HEADSHOT_BONUS,
  ASSIST_SCORE,
  SLIDE_KILL_BONUS,
  MIDAIR_KILL_BONUS,
  LONGSHOT_BONUS,
  REVENGE_BONUS,
  STREAK_BONUS_STEP,
} from "../../shared/constants/index.js";
import { ARENA_MAP } from "../../shared/maps/arena.js";
import { PlayerEntity } from "../game/PlayerEntity.js";
import { validateShot } from "../game/CombatSystem.js";
import { vec3Distance } from "../../shared/physics/movement.js";

export class Room {
  public id: string;
  public name: string;
  public players = new Map<string, PlayerEntity>();
  public phase: GamePhase = GamePhase.WAITING; // GamePhase.WAITING, GamePhase.PLAYING, GamePhase.ENDED
  public timeRemaining = TIME_LIMIT;
  public killLimit = KILL_LIMIT;

  private sendToPlayer: (playerId: string, packet: ServerPacket) => void;
  private broadcastToAll: (packet: ServerPacket, excludeId?: string) => void;

  private gameLoopInterval: NodeJS.Timeout | null = null;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private lastTickTime = 0;
  private gameStartTime = 0;
  private shutdownCallback: () => void;

  constructor(
    id: string,
    name: string,
    sendToPlayer: (playerId: string, packet: ServerPacket) => void,
    broadcastToAll: (packet: ServerPacket, excludeId?: string) => void,
    shutdownCallback: () => void,
  ) {
    this.id = id;
    this.name = name;
    this.sendToPlayer = sendToPlayer;
    this.broadcastToAll = broadcastToAll;
    this.shutdownCallback = shutdownCallback;

    this.startIntervals();
  }

  private startIntervals(): void {
    this.lastTickTime = Date.now();
    this.gameLoopInterval = setInterval(() => this.tick(), TICK_INTERVAL);
    this.snapshotInterval = setInterval(
      () => this.broadcastSnapshot(),
      NETWORK_INTERVAL,
    );
  }

  public destroy(): void {
    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.players.clear();
  }

  public handleJoin(
    playerId: string,
    nickname: string,
    selectedWeapon?: string,
  ): void {
    const spawnPoint = this.getSpawnPoint();
    const player = new PlayerEntity(playerId, nickname, spawnPoint);
    if (selectedWeapon && WEAPONS[selectedWeapon]) {
      player.state.weapon = selectedWeapon as WeaponType;
    }
    this.players.set(playerId, player);

    // Initial ammo state
    const weaponConfig = WEAPONS[player.state.weapon];
    if (weaponConfig) {
      player.state.ammo = weaponConfig.magazineSize;
      player.state.maxAmmo = weaponConfig.magazineSize;
    }

    // Build current players record
    const playersRecord: Record<string, PlayerState> = {};
    for (const [id, entity] of this.players) {
      playersRecord[id] = entity.toState();
    }

    // Acknowledge join
    this.sendToPlayer(playerId, {
      type: PacketType.S_JOIN_ACK,
      playerId,
      roomId: this.id,
      map: ARENA_MAP,
      state: {
        players: playersRecord,
        phase: this.phase,
        timeRemaining: this.timeRemaining,
        killLimit: this.killLimit,
      },
    });

    // Notify others
    this.broadcastToAll(
      {
        type: PacketType.S_PLAYER_JOINED,
        player: player.toState(),
      },
      playerId,
    );

    console.log(`[Room ${this.id}] Player ${nickname} (${playerId}) joined`);

    // Autostart game if we have enough players and are waiting
    if (
      this.phase === GamePhase.WAITING &&
      this.players.size >= MIN_PLAYERS_TO_START
    ) {
      this.startGame();
    }
  }

  public handleLeave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);
    this.broadcastToAll({
      type: PacketType.S_PLAYER_LEFT,
      playerId,
    });

    console.log(
      `[Room ${this.id}] Player ${player.state.nickname} (${playerId}) left`,
    );

    if (this.players.size === 0) {
      console.log(`[Room ${this.id}] Room is empty. Shutting down.`);
      this.destroy();
      this.shutdownCallback();
    }
  }

  public handleInput(playerId: string, input: InputState): void {
    const player = this.players.get(playerId);
    if (player && player.state.alive) {
      player.queueInput(input);
    }
  }

  public handleShoot(playerId: string, origin: Vec3, direction: Vec3): void {
    const shooter = this.players.get(playerId);
    if (!shooter || !shooter.state.alive || shooter.state.reloading) return;

    // --- Anti-cheat: Origin verification ---
    // Check if the shot origin is too far from the player's authoritative position (e.g., > 3.0 meters)
    const distFromPlayer = vec3Distance(origin, shooter.state.position);
    if (distFromPlayer > 3.0) {
      console.warn(
        `[Anti-Cheat] Player ${shooter.state.nickname} (${playerId}) shot from invalid origin. Distance: ${distFromPlayer.toFixed(2)}m`,
      );
      // Optional: Flag player or reject shot
      return;
    }

    const now = Date.now();
    if (!shooter.canShoot(now)) return;

    // Trigger weapon shoot state
    shooter.shoot(now);

    const weaponConfig = WEAPONS[shooter.state.weapon];
    if (!weaponConfig) return;

    // Validate shot
    const hits = validateShot(
      origin,
      direction,
      playerId,
      this.players,
      ARENA_MAP.boxes,
      weaponConfig,
    );

    // Apply damage to hits
    for (const hit of hits) {
      const target = this.players.get(hit.targetId);
      if (!target) continue;

      const { killed, assistors } = target.takeDamage(hit.damage, playerId);

      // Confirm hit to shooter
      this.sendToPlayer(playerId, {
        type: PacketType.S_HIT_CONFIRM,
        hit: {
          targetId: hit.targetId,
          damage: hit.damage,
          headshot: hit.headshot,
          position: hit.hitPosition,
        },
      });

      if (killed) {
        shooter.state.kills++;
        shooter.state.streak++;

        const distance = Math.round(vec3Distance(origin, hit.hitPosition));
        const bonusTags: string[] = [];
        let scoreDelta = BASE_KILL_SCORE;

        if (hit.headshot) {
          scoreDelta += HEADSHOT_BONUS;
          bonusTags.push("Headshot");
        }

        if (shooter.state.sliding) {
          scoreDelta += SLIDE_KILL_BONUS;
          bonusTags.push("Slide Kill");
        }

        if (!target.state.grounded) {
          scoreDelta += MIDAIR_KILL_BONUS;
          bonusTags.push("Midair Kill");
        }

        if (distance >= 25) {
          scoreDelta += LONGSHOT_BONUS;
          bonusTags.push("Longshot");
        }

        if (shooter.lastDamageBy === hit.targetId) {
          scoreDelta += REVENGE_BONUS;
          bonusTags.push("Revenge");
        }

        const streakBonus = Math.min(
          shooter.state.streak * STREAK_BONUS_STEP,
          100,
        );
        if (streakBonus > 0) {
          scoreDelta += streakBonus;
          bonusTags.push(`Streak +${streakBonus}`);
        }

        shooter.state.score += scoreDelta;

        for (const assistId of assistors) {
          const assister = this.players.get(assistId);
          if (!assister) continue;
          assister.state.assists++;
          assister.state.score += ASSIST_SCORE;
        }

        // Send kill notification
        this.broadcastToAll({
          type: PacketType.S_KILL,
          kill: {
            killerId: playerId,
            killerName: shooter.state.nickname,
            victimId: hit.targetId,
            victimName: target.state.nickname,
            weapon: shooter.state.weapon,
            headshot: hit.headshot,
            distance,
            scoreDelta,
            bonusTags,
            timestamp: now,
          },
        });

        // Send death packet to victim
        this.sendToPlayer(hit.targetId, {
          type: PacketType.S_DEATH,
          killerId: playerId,
          respawnTime: RESPAWN_TIME,
        });

        this.checkWinConditions();
      }
    }
  }

  public handleReload(playerId: string): void {
    const player = this.players.get(playerId);
    if (player && player.state.alive) {
      player.startReload(Date.now());
    }
  }

  private startGame(): void {
    this.phase = GamePhase.PLAYING;
    this.timeRemaining = TIME_LIMIT;
    this.gameStartTime = Date.now();

    // Respawn all players at game start
    for (const player of this.players.values()) {
      const spawnPoint = this.getSpawnPoint();
      player.respawn(spawnPoint);
      this.sendToPlayer(player.state.id, {
        type: PacketType.S_SPAWN,
        position: spawnPoint.position,
        rotation: spawnPoint.rotation,
      });
    }

    this.broadcastToAll({
      type: PacketType.S_GAME_PHASE,
      phase: this.phase,
      timeRemaining: this.timeRemaining,
    });

    console.log(`[Room ${this.id}] Game started`);
  }

  private tick(): void {
    const now = Date.now();
    const dt = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    if (this.phase === GamePhase.PLAYING) {
      // Update remaining time
      const elapsed = now - this.gameStartTime;
      this.timeRemaining = Math.max(TIME_LIMIT - elapsed, 0);

      if (this.timeRemaining <= 0) {
        this.endGame();
        return;
      }
    }

    // Update player simulations and timers
    for (const player of this.players.values()) {
      if (player.state.alive) {
        player.checkReload(now);
        player.processInputs(ARENA_MAP.boxes);
      } else {
        // Handle respawn timer
        if (player.shouldRespawn(now)) {
          const spawnPoint = this.getSpawnPoint();
          player.respawn(spawnPoint);
          this.sendToPlayer(player.state.id, {
            type: PacketType.S_SPAWN,
            position: spawnPoint.position,
            rotation: spawnPoint.rotation,
          });
        }
      }
    }
  }

  private broadcastSnapshot(): void {
    const playersRecord: Record<string, PlayerState> = {};
    const lastProcessedInput: Record<string, number> = {};

    for (const [id, entity] of this.players) {
      playersRecord[id] = entity.toState();
      lastProcessedInput[id] = entity.lastProcessedSequence;
    }

    this.broadcastToAll({
      type: PacketType.S_SNAPSHOT,
      tick: 0, // Tick counter can be simplified or omitted
      timestamp: Date.now(),
      players: playersRecord,
      lastProcessedInput,
      match: {
        phase: this.phase,
        timeRemaining: this.timeRemaining,
        killLimit: this.killLimit,
      },
    });
  }

  private checkWinConditions(): void {
    if (this.phase !== GamePhase.PLAYING) return;

    // Check if any player has reached the kill limit
    let winner: PlayerEntity | null = null;
    for (const player of this.players.values()) {
      if (player.state.kills >= this.killLimit) {
        if (!winner || player.state.kills > winner.state.kills) {
          winner = player;
        }
      }
    }

    if (winner) {
      this.endGame(winner);
    }
  }

  private endGame(winnerEntity?: PlayerEntity): void {
    this.phase = GamePhase.ENDED;

    let winnerInfo = undefined;
    if (winnerEntity) {
      winnerInfo = {
        id: winnerEntity.state.id,
        nickname: winnerEntity.state.nickname,
        kills: winnerEntity.state.kills,
      };
    } else {
      // Find player with most kills
      let topPlayer: PlayerEntity | null = null;
      for (const player of this.players.values()) {
        if (!topPlayer || player.state.kills > topPlayer.state.kills) {
          topPlayer = player;
        }
      }
      if (topPlayer) {
        winnerInfo = {
          id: topPlayer.state.id,
          nickname: topPlayer.state.nickname,
          kills: topPlayer.state.kills,
        };
      }
    }

    this.broadcastToAll({
      type: PacketType.S_GAME_PHASE,
      phase: this.phase,
      timeRemaining: 0,
      winner: winnerInfo,
    });

    console.log(
      `[Room ${this.id}] Game ended. Winner: ${winnerInfo?.nickname || "None"}`,
    );

    // Wait and restart game
    setTimeout(() => this.restartGame(), END_GAME_COOLDOWN);
  }

  private restartGame(): void {
    if (this.players.size === 0) {
      this.phase = GamePhase.WAITING;
      return;
    }

    // Reset scores
    for (const player of this.players.values()) {
      player.state.kills = 0;
      player.state.deaths = 0;
    }

    this.startGame();
  }

  /**
   * Selection of spawn point furthest from any other player
   */
  private getSpawnPoint(): SpawnPoint {
    const spawns = ARENA_MAP.spawnPoints;
    if (this.players.size === 0) {
      return spawns[Math.floor(Math.random() * spawns.length)];
    }

    let bestSpawn = spawns[0];
    let maxMinDistance = -1;

    for (const spawn of spawns) {
      let minDistance = Infinity;

      for (const player of this.players.values()) {
        if (!player.state.alive) continue;
        const dist = vec3Distance(spawn.position, player.state.position);
        if (dist < minDistance) {
          minDistance = dist;
        }
      }

      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        bestSpawn = spawn;
      }
    }

    return bestSpawn;
  }
}
