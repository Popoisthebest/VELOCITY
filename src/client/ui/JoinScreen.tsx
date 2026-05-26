// ========================================
// Client-Side Join / Lobby Component
// Styled lobby with premium animations, inputs, and socket connections
// ========================================

import React, { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import { networkClient } from "../network/NetworkClient.js";
import { PacketType } from "@shared/protocol/index.js";
import { WEAPONS } from "@shared/constants/index.js";
import { inputManager } from "../systems/InputManager.js";

export function JoinScreen() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const setNickname = useGameStore((state) => state.setNickname);

  const [selectedWeapon, setSelectedWeapon] = useState("assault_rifle");
  const [sensitivity, setSensitivity] = useState(inputManager.getSensitivity());
  const [volume, setVolume] = useState(0.8);
  const [graphicsQuality, setGraphicsQuality] = useState("high");

  const handlePlay = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nickname is required!");
      return;
    }
    if (trimmed.length > 12) {
      setError("Nickname must be 12 characters or less");
      return;
    }

    setError("");
    setConnecting(true);
    setNickname(trimmed);
    inputManager.setSensitivity(sensitivity);

    // Dynamic websocket resolution based on environment or host
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const defaultWsUrl = isLocalhost
      ? `${wsProtocol}//${window.location.hostname}:3001`
      : `${wsProtocol}//${window.location.host}`;
    const wsUrl = (import.meta.env.VITE_WS_URL as string) || defaultWsUrl;

    try {
      // Connect client
      networkClient.connect(wsUrl);

      // Wait a moment for connection open, then send join packet.
      // In a real system, NetworkClient handlePacket processes S_JOIN_ACK.
      // We will listen for socket status or send JOIN packet upon open.
      const checkConnection = setInterval(() => {
        if (networkClient.isConnected()) {
          clearInterval(checkConnection);
          networkClient.send({
            type: PacketType.C_JOIN,
            nickname: trimmed,
            selectedWeapon,
          });
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkConnection);
        if (!networkClient.isConnected()) {
          networkClient.disconnect();
          setConnecting(false);
          setError("Failed to connect to game server. Is it running?");
        }
      }, 5000);
    } catch (err) {
      console.error(err);
      setConnecting(false);
      setError("Socket connection failed");
    }
  };

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-slate-950 overflow-hidden select-none">
      {/* Premium Cyberpunk grid backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,41,59,0.3)_0%,rgba(2,6,23,0.9)_80%)] z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20 z-0" />

      <div className="w-full max-w-md p-8 rounded-2xl glass-panel relative z-10 border border-slate-800 shadow-2xl flex flex-col items-center">
        {/* Logo / Game Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 drop-shadow-md">
            ARENA FPS
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-2 font-semibold">
            Browser-Based 3D Shooter MVP
          </p>
        </div>

        {/* Play Form */}
        <form onSubmit={handlePlay} className="w-full flex flex-col gap-5">
          <div>
            <label
              htmlFor="nickname"
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Select Nickname
            </label>
            <input
              id="nickname"
              type="text"
              placeholder="Nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={connecting}
              autoFocus
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-semibold"
            />
          </div>
          <div>
            <label
              htmlFor="weapon"
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Starting Weapon
            </label>
            <select
              id="weapon"
              value={selectedWeapon}
              onChange={(e) => setSelectedWeapon(e.target.value)}
              disabled={connecting}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-semibold"
            >
              {Object.entries(WEAPONS).map(([key, weapon]) => (
                <option key={key} value={key}>
                  {weapon.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="sensitivity"
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Mouse Sensitivity
            </label>
            <input
              id="sensitivity"
              type="range"
              min="0.001"
              max="0.01"
              step="0.0005"
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              disabled={connecting}
              className="w-full accent-amber-500"
            />
            <div className="text-xs text-slate-400 mt-1">
              {(sensitivity * 1000).toFixed(1)} sensitivity
            </div>
          </div>
          <div>
            <label
              htmlFor="volume"
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Volume
            </label>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={connecting}
              className="w-full accent-amber-500"
            />
            <div className="text-xs text-slate-400 mt-1">
              {Math.round(volume * 100)}%
            </div>
          </div>
          <div>
            <label
              htmlFor="graphics"
              className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
            >
              Graphics Quality
            </label>
            <select
              id="graphics"
              value={graphicsQuality}
              onChange={(e) => setGraphicsQuality(e.target.value)}
              disabled={connecting}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-semibold"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {error && (
            <div className="px-4 py-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 font-semibold uppercase tracking-wide">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={connecting}
            className="w-full py-4 rounded-xl font-black text-slate-950 uppercase tracking-widest bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-98 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-orange-500/20"
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-slate-950"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Connecting...
              </span>
            ) : (
              "Enter Arena"
            )}
          </button>
        </form>

        {/* Controls Tutorial */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 w-full">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">
            Controls
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-500">
            <div className="flex justify-between">
              <span className="font-medium">Move:</span>
              <span className="font-bold text-slate-400">WASD</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Look:</span>
              <span className="font-bold text-slate-400">Mouse</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Shoot:</span>
              <span className="font-bold text-slate-400">Left Click</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Jump:</span>
              <span className="font-bold text-slate-400">Space</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Sprint:</span>
              <span className="font-bold text-slate-400">Shift</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Crouch:</span>
              <span className="font-bold text-slate-400">C</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Reload:</span>
              <span className="font-bold text-slate-400">R</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Scores:</span>
              <span className="font-bold text-slate-400">Hold Tab</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
