// ========================================
// Server-Side WebSocket Server
// Manages client connections, packet routing, and room routing
// ========================================

import { WebSocketServer as WSServer, WebSocket } from "ws";
import type { Server } from "http";
import { decodePacket, encodePacket } from "../../shared/protocol/index.js";
import type {
  ClientPacket,
  ServerPacket,
} from "../../shared/protocol/index.js";
import { PacketType } from "../../shared/protocol/index.js";
import { RoomManager } from "../rooms/RoomManager.js";

export class WebSocketServer {
  private wss: WSServer;
  private connections = new Map<string, WebSocket>();
  private roomManager: RoomManager;

  constructor(server: Server) {
    this.wss = new WSServer({ noServer: true });

    this.roomManager = new RoomManager(
      (playerId, packet) => this.sendToPlayer(playerId, packet),
      (roomId, packet, excludeId) =>
        this.broadcastToRoom(roomId, packet, excludeId),
    );

    // Attach to server
    server.on("upgrade", (request, socket, head) => {
      // Allow any websocket connection on upgrade for MVP
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws: WebSocket) => this.handleConnection(ws));
    console.log("[WebSocketServer] Ready for connections");
  }

  private handleConnection(ws: WebSocket): void {
    const playerId = "p_" + Math.random().toString(36).substring(2, 11);
    this.connections.set(playerId, ws);

    console.log(`[WebSocketServer] Client connected: ${playerId}`);

    ws.on("message", (message: Buffer | ArrayBuffer | Uint8Array) => {
      try {
        const packet = decodePacket(message as Uint8Array) as ClientPacket;
        this.handlePacket(playerId, packet);
      } catch (err) {
        console.error(
          `[WebSocketServer] Error processing message from ${playerId}:`,
          err,
        );
        this.sendToPlayer(playerId, {
          type: PacketType.S_ERROR,
          message: "Invalid packet format",
        });
      }
    });

    ws.on("close", () => {
      this.handleDisconnect(playerId);
    });

    ws.on("error", (error) => {
      console.error(
        `[WebSocketServer] Socket error for player ${playerId}:`,
        error,
      );
      this.handleDisconnect(playerId);
    });
  }

  private handleDisconnect(playerId: string): void {
    if (!this.connections.has(playerId)) return;

    this.connections.delete(playerId);
    this.roomManager.removePlayer(playerId);
    console.log(`[WebSocketServer] Client disconnected: ${playerId}`);
  }

  private handlePacket(playerId: string, packet: ClientPacket): void {
    switch (packet.type) {
      case PacketType.C_JOIN: {
        const room = this.roomManager.joinOrCreate(
          playerId,
          packet.nickname,
          packet.roomId,
          packet.selectedWeapon,
        );
        // Also send updated room list to all connection lobbies (in a real game, or just respond/broadcast)
        this.broadcastRoomList();
        break;
      }

      case PacketType.C_INPUT: {
        const room = this.roomManager.getPlayerRoom(playerId);
        if (room) {
          room.handleInput(playerId, packet.input);
        }
        break;
      }

      case PacketType.C_SHOOT: {
        const room = this.roomManager.getPlayerRoom(playerId);
        if (room) {
          room.handleShoot(playerId, packet.origin, packet.direction);
        }
        break;
      }

      case PacketType.C_RELOAD: {
        const room = this.roomManager.getPlayerRoom(playerId);
        if (room) {
          room.handleReload(playerId);
        }
        break;
      }

      case PacketType.C_PING: {
        this.sendToPlayer(playerId, {
          type: PacketType.S_PONG,
          timestamp: packet.timestamp,
        });
        break;
      }

      default:
        console.warn(
          `[WebSocketServer] Unhandled packet type from ${playerId}:`,
          (packet as any).type,
        );
    }
  }

  public sendToPlayer(playerId: string, packet: ServerPacket): void {
    const ws = this.connections.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(encodePacket(packet));
    }
  }

  public broadcastToRoom(
    roomId: string,
    packet: ServerPacket,
    excludeId?: string,
  ): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    const payload = encodePacket(packet);

    for (const playerId of room.players.keys()) {
      if (playerId === excludeId) continue;
      const ws = this.connections.get(playerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private broadcastRoomList(): void {
    const roomsInfo = this.roomManager.getRoomsInfo();
    const packet: ServerPacket = {
      type: PacketType.S_ROOM_LIST,
      rooms: roomsInfo,
    };
    const payload = encodePacket(packet);

    for (const ws of this.connections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  public shutdown(): void {
    this.roomManager.destroy();
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();
    this.wss.close();
  }
}
