// ========================================
// Client-Side Heads-Up Display (HUD)
// Render overlays for crosshair, health, ammo, killfeed, ping, and death screens
// ========================================

import React, { useEffect, useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import { t } from "../i18n/index.js";
import { WEAPONS } from "@shared/constants/index.js";

export function HUD() {
  const localPlayer = useGameStore((state) => state.localPlayer);
  const isDead = useGameStore((state) => state.isDead);
  const killFeed = useGameStore((state) => state.killFeed);
  const hitMarker = useGameStore((state) => state.hitMarker);
  const damageNumbers = useGameStore((state) => state.damageNumbers);
  const ping = useGameStore((state) => state.ping);
  const fps = useGameStore((state) => state.fps);
  const timeRemaining = useGameStore((state) => state.timeRemaining);
  const killLimit = useGameStore((state) => state.killLimit);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const winner = useGameStore((state) => state.winner);

  // Local state countdown for death respawn
  const [respawnCountdown, setRespawnCountdown] = useState(3);
  const [restartCountdown, setRestartCountdown] = useState(5);

  useEffect(() => {
    if (isDead) {
      setRespawnCountdown(3);
      const timer = setInterval(() => {
        setRespawnCountdown((c) => Math.max(c - 1, 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isDead]);

  useEffect(() => {
    if (gamePhase === "ended") {
      setRestartCountdown(5);
      const timer = setInterval(() => {
        setRestartCountdown((c) => Math.max(c - 1, 0));
      }, 1000);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [gamePhase]);

  if (!localPlayer) return null;

  // Calculate speed for dynamic crosshair expansion
  const speed = Math.sqrt(
    localPlayer.velocity.x * localPlayer.velocity.x +
      localPlayer.velocity.z * localPlayer.velocity.z,
  );
  // Base gap: 6px, expands by speed
  const crosshairGap = 6 + speed * 1.5;

  // Health color styling
  const hp = localPlayer.health;
  let hpColor = "bg-emerald-500";
  let hpTextColor = "text-emerald-400";
  if (hp <= 30) {
    hpColor = "bg-rose-500 animate-pulse";
    hpTextColor = "text-rose-500 font-extrabold";
  } else if (hp <= 60) {
    hpColor = "bg-amber-500";
    hpTextColor = "text-amber-400";
  }

  // Ammo color styling
  const ammoRatio = localPlayer.ammo / localPlayer.maxAmmo;
  const isLowAmmo = ammoRatio <= 0.25;

  // Weapon display name
  const weaponConfig = WEAPONS[localPlayer.weapon];
  const weaponName = weaponConfig ? weaponConfig.name : "Unknown";
  const score = localPlayer.score;
  const now = Date.now();
  const protectionRemaining = Math.max(
    localPlayer.spawnProtectionUntil - now,
    0,
  );

  const displayTime = Math.max(timeRemaining, 0);
  const timerMinutes = Math.floor(displayTime / 60000);
  const timerSeconds = Math.floor((displayTime % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const phaseLabel =
    gamePhase === "waiting"
      ? t("waitingForPlayers")
      : gamePhase === "ended"
        ? t("matchComplete")
        : t("matchLive");

  return (
    <div className="absolute inset-0 z-40 pointer-events-none font-game select-none">
      <div className="absolute inset-x-0 top-4 flex items-center justify-center gap-3 pointer-events-none">
        <div className="px-4 py-2 rounded-2xl bg-slate-950/75 border border-slate-800/50 text-xs uppercase tracking-[0.2em] text-slate-300 shadow-lg shadow-black/10">
          {phaseLabel}
        </div>
        <div className="px-4 py-2 rounded-2xl bg-slate-950/90 border border-slate-800/60 text-sm font-bold tracking-wider text-white shadow-lg shadow-black/15">
          {timerMinutes}:{timerSeconds}
        </div>
        <div className="px-4 py-2 rounded-2xl bg-slate-950/75 border border-slate-800/50 text-xs uppercase tracking-[0.2em] text-slate-300 shadow-lg shadow-black/10">
          {t("score")}: <span className="text-amber-400">{score}</span>
        </div>
      </div>

      {protectionRemaining > 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-950/75 border border-slate-700/60 text-[11px] uppercase tracking-[0.2em] text-sky-300 shadow-lg shadow-black/20 pointer-events-none">
          Spawn protection: {(protectionRemaining / 1000).toFixed(1)}s
        </div>
      )}

      {/* ── Dynamic Crosshair & Hitmarker ────────────────── */}
      {!isDead && gamePhase !== "ended" && (
        <>
          <div
            className="crosshair-container"
            style={
              { "--spread-gap": `${crosshairGap}px` } as React.CSSProperties
            }
          >
            <div className="crosshair-center" />
            <div className="crosshair-line crosshair-top" />
            <div className="crosshair-line crosshair-bottom" />
            <div className="crosshair-line crosshair-left" />
            <div className="crosshair-line crosshair-right" />

            {/* Hit Marker Flash */}
            {hitMarker && (
              <div className="hitmarker">
                <div className="hitmarker-line-tl-br" />
                <div className="hitmarker-line-tr-bl" />
              </div>
            )}
          </div>

          {/* Damage Numbers */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-full h-full">
              {damageNumbers.map((num) => {
                const age = (Date.now() - num.createdAt) / 1000;
                if (age > 1) return null;
                const opacity = 1 - age;
                const yOffset = -age * 40;
                return (
                  <div
                    key={num.id}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 text-2xl font-black tracking-wider ${num.headshot ? "text-amber-300" : "text-white"}`}
                    style={{
                      opacity,
                      transform: `translate(-50%, calc(-50% + ${yOffset}px))`,
                    }}
                  >
                    {num.headshot
                      ? `${t("headshot")} ${num.damage}`
                      : `-${num.damage}`}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {hp <= 35 && !isDead && gamePhase !== "ended" && (
        <div className="absolute inset-0 bg-rose-500/15 pointer-events-none" />
      )}

      {/* ── Top-Left: Network Diagnostics ───────────────── */}
      <div className="absolute top-4 left-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/40 text-[10px] font-mono text-slate-400 tracking-wider">
        <div className="flex items-center gap-3">
          <span>
            FPS: <strong className="text-slate-100">{fps}</strong>
          </span>
          <span>
            PING:{" "}
            <strong
              className={ping > 100 ? "text-rose-400" : "text-emerald-400"}
            >
              {ping}ms
            </strong>
          </span>
        </div>
      </div>

      {/* ── Top-Right: Kill Feed ────────────────────────── */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 w-64 items-end">
        {killFeed.map((item) => (
          <div
            key={item.id}
            className={`kill-feed-item flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-bold shadow ${
              item.fadeOut ? "fade-out" : ""
            }`}
          >
            <span className="text-slate-300">{item.killerName}</span>
            <span className="text-slate-500 font-normal">
              {item.headshot ? (
                <span className="text-amber-400 font-extrabold text-[10px] uppercase px-1 bg-amber-500/10 rounded border border-amber-500/20">
                  {t("headshot")}
                </span>
              ) : (
                t("kill")
              )}
            </span>
            <span className="text-rose-400">{item.victimName}</span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({WEAPONS[item.weapon]?.name || item.weapon})
            </span>
          </div>
        ))}
      </div>

      {/* ── Bottom-Left: Health & Armor ──────────────────── */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1 w-64 p-4 rounded-2xl bg-slate-950/75 backdrop-blur-md border border-slate-800/50 shadow-2xl">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
            {t("health")}
          </span>
          <span className={`text-3xl font-black font-mono ${hpTextColor}`}>
            {hp}
          </span>
        </div>
        <div className="w-full h-3 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${hpColor} transition-all duration-100`}
            style={{ width: `${hp}%` }}
          />
        </div>
      </div>

      {/* ── Bottom-Right: Ammo & Weapon ──────────────────── */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end p-4 rounded-2xl bg-slate-950/75 backdrop-blur-md border border-slate-800/50 shadow-2xl min-w-44 text-right">
        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-0.5">
          {t("weaponSelect")}
        </span>
        <span className="text-lg font-black text-white tracking-wide mb-1 uppercase">
          {weaponName}
        </span>

        {localPlayer.reloading ? (
          <span className="text-xl font-black text-amber-500 animate-pulse tracking-widest uppercase">
            {t("reload")}...
          </span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl font-black font-mono ${isLowAmmo ? "text-rose-500 animate-pulse" : "text-slate-100"}`}
            >
              {localPlayer.ammo}
            </span>
            <span className="text-slate-600 text-sm font-bold font-mono">
              / {localPlayer.maxAmmo}
            </span>
          </div>
        )}
      </div>

      {/* ── Death Overlay Screen ─────────────────────────── */}
      {isDead && (
        <div className="absolute inset-0 bg-rose-950/45 backdrop-blur-sm flex flex-col items-center justify-center text-center">
          <h1 className="text-6xl font-black text-rose-500 tracking-widest uppercase drop-shadow-md animate-bounce">
            {t("youDied")}
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-wider">
            {t("respawning")}{" "}
            <span className="text-white font-mono text-lg font-black">
              {respawnCountdown}
            </span>
            s
          </p>
        </div>
      )}

      {/* ── Game Ended / Restarting Screen ────────────────── */}
      {gamePhase === "ended" && winner && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center text-center">
          <span className="text-amber-500 text-sm font-extrabold tracking-widest uppercase mb-1">
            {t("matchComplete")}
          </span>
          <h1 className="text-5xl font-black text-white tracking-wider uppercase mb-2">
            {winner.nickname} Wins!
          </h1>
          <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-6">
            With{" "}
            <strong className="text-amber-400 font-mono">{winner.kills}</strong>{" "}
            Kills
          </p>

          <div className="flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-amber-500"
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
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Restarting Match...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
