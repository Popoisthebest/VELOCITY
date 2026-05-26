// ========================================
// Server-Side Room Manager
// Handles Room lifecycle and player routing
// ========================================

import { Room } from "./Room.js";
import type { RoomInfo } from "../../shared/types/index.js";
import type { ServerPacket } from "../../shared/protocol/index.js";
import { MAX_PLAYERS_PER_ROOM } from "../../shared/constants/index.js";

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerRooms = new Map<string, Room>();
  private roomCount = 0;

  private sendToPlayer: (playerId: string, packet: ServerPacket) => void;
  private broadcastToRoom: (
    roomId: string,
    packet: ServerPacket,
    excludeId?: string,
  ) => void;

  constructor(
    sendToPlayer: (playerId: string, packet: ServerPacket) => void,
    broadcastToRoom: (
      roomId: string,
      packet: ServerPacket,
      excludeId?: string,
    ) => void,
  ) {
    this.sendToPlayer = sendToPlayer;
    this.broadcastToRoom = broadcastToRoom;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getPlayerRoom(playerId: string): Room | undefined {
    return this.playerRooms.get(playerId);
  }

  public joinOrCreate(
    playerId: string,
    nickname: string,
    preferredRoomId?: string,
    selectedWeapon?: string,
  ): Room {
    // Check if player is already in a room
    const currentRoom = this.playerRooms.get(playerId);
    if (currentRoom) {
      if (preferredRoomId && currentRoom.id === preferredRoomId) {
        return currentRoom;
      }
      this.removePlayer(playerId);
    }

    let targetRoom: Room | undefined;

    // 1. Try preferred room
    if (preferredRoomId) {
      const room = this.rooms.get(preferredRoomId);
      if (room && room.players.size < MAX_PLAYERS_PER_ROOM) {
        targetRoom = room;
      }
    }

    // 2. Try to find any existing room with space
    if (!targetRoom) {
      for (const room of this.rooms.values()) {
        if (
          room.players.size < MAX_PLAYERS_PER_ROOM &&
          room.phase !== "ended"
        ) {
          targetRoom = room;
          break;
        }
      }
    }

    // 3. Create a new room
    if (!targetRoom) {
      this.roomCount++;
      const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;
      const roomName = `Arena #${this.roomCount}`;

      targetRoom = new Room(
        roomId,
        roomName,
        this.sendToPlayer,
        (packet, excludeId) => this.broadcastToRoom(roomId, packet, excludeId),
        () => this.onRoomShutdown(roomId),
      );
      this.rooms.set(roomId, targetRoom);
      console.log(`[RoomManager] Created room ${roomName} (${roomId})`);
    }

    this.playerRooms.set(playerId, targetRoom);
    targetRoom.handleJoin(playerId, nickname, selectedWeapon);

    return targetRoom;
  }

  public removePlayer(playerId: string): void {
    const room = this.playerRooms.get(playerId);
    if (!room) return;

    room.handleLeave(playerId);
    this.playerRooms.delete(playerId);
  }

  public getRoomsInfo(): RoomInfo[] {
    const infoList: RoomInfo[] = [];
    for (const room of this.rooms.values()) {
      infoList.push({
        id: room.id,
        name: room.name,
        playerCount: room.players.size,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        phase: room.phase,
      });
    }
    return infoList;
  }

  private onRoomShutdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      // Clean up player mappings
      for (const playerId of room.players.keys()) {
        this.playerRooms.delete(playerId);
      }
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Closed room ${room.name} (${roomId})`);
    }
  }

  public destroy(): void {
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
    this.playerRooms.clear();
  }
}
