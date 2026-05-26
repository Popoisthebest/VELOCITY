// ========================================
// Client-Side Scoreboard Component
// Overlay showing current room player ranks, kills, deaths, K/D, and pings
// ========================================

import React from "react";
import { useGameStore } from "../store/gameStore.js";
import type { PlayerState } from "@shared/types/index.js";

function formatTime(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function Scoreboard() {
  const showScoreboard = useGameStore((state) => state.showScoreboard);
  const localPlayer = useGameStore((state) => state.localPlayer);
  const remotePlayers = useGameStore((state) => state.remotePlayers);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const timeRemaining = useGameStore((state) => state.timeRemaining);
  const killLimit = useGameStore((state) => state.killLimit);
  const localPlayerId = useGameStore((state) => state.playerId);

  if (!showScoreboard) return null;

  // Gather all players
  const allPlayers: PlayerState[] = [];
  if (localPlayer) {
    allPlayers.push(localPlayer);
  }
  for (const p of remotePlayers.values()) {
    allPlayers.push(p);
  }

  // Sort by score descending, then kills descending
  allPlayers.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.kills !== a.kills) {
      return b.kills - a.kills;
    }
    return a.deaths - b.deaths;
  });

  return (
    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 pointer-events-none">
      <div className="w-full max-w-2xl glass-panel rounded-xl overflow-hidden shadow-2xl p-6 pointer-events-auto select-none border border-slate-700/30">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-amber-500 uppercase tracking-widest">
              Scoreboard
            </h2>
            <p className="text-xs text-slate-400 mt-1 uppercase">
              Phase:{" "}
              <span className="font-semibold text-slate-300">{gamePhase}</span>{" "}
              | Limit:{" "}
              <span className="font-semibold text-slate-300">
                {killLimit} kills
              </span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-white tracking-wider">
              {formatTime(timeRemaining)}
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Time Remaining
            </span>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-2 px-3 w-10 text-center">Rank</th>
              <th className="py-2 px-4">Player</th>
              <th className="py-2 px-3 text-center">Score</th>
              <th className="py-2 px-4 text-center">Kills</th>
              <th className="py-2 px-4 text-center">Deaths</th>
              <th className="py-2 px-4 text-center">Assists</th>
              <th className="py-2 px-4 text-center">Streak</th>
              <th className="py-2 px-4 text-center">K/D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {allPlayers.map((player, index) => {
              const isSelf = player.id === localPlayerId;
              const kd =
                player.deaths === 0
                  ? player.kills
                  : player.kills / player.deaths;

              return (
                <tr
                  key={player.id}
                  className={`text-sm font-semibold transition-colors duration-150 ${
                    isSelf
                      ? "bg-amber-500/10 text-amber-300 border-l-4 border-amber-500"
                      : "text-slate-300 hover:bg-slate-900/40"
                  }`}
                >
                  <td className="py-3 px-3 text-center text-xs font-mono font-bold text-slate-500">
                    #{index + 1}
                  </td>
                  <td className="py-3 px-4 font-bold flex items-center gap-2">
                    {player.nickname}
                    {isSelf && (
                      <span className="text-[9px] font-extrabold uppercase px-1 bg-amber-500/20 text-amber-400 rounded">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-amber-300">
                    {player.score}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-100">
                    {player.kills}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-400">
                    {player.deaths}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-400">
                    {player.assists}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-400">
                    {player.streak}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-400">
                    {kd.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer instructions */}
        <div className="mt-4 pt-3 border-t border-slate-800 text-center text-[10px] text-slate-500 uppercase tracking-wider">
          Release{" "}
          <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300 mx-0.5">
            Tab
          </kbd>{" "}
          to return to game
        </div>
      </div>
    </div>
  );
}
