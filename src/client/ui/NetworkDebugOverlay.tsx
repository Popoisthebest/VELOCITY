import { useGameStore } from "../store/gameStore.js";

export default function NetworkDebugOverlay() {
  const connected = useGameStore((state) => state.connected);
  const ping = useGameStore((state) => state.ping);
  const fps = useGameStore((state) => state.fps);
  const roomId = useGameStore((state) => state.roomId);
  const playerId = useGameStore((state) => state.playerId);
  const localPlayer = useGameStore((state) => state.localPlayer);
  const remotePlayers = useGameStore((state) => state.remotePlayers);
  const gamePhase = useGameStore((state) => state.gamePhase);
  const timeRemaining = useGameStore((state) => state.timeRemaining);

  return (
    <div className="absolute left-4 top-20 z-[60] w-72 rounded-lg border border-cyan-400/30 bg-slate-950/90 p-3 font-mono text-[11px] leading-relaxed text-slate-200 shadow-2xl shadow-black/30 pointer-events-none">
      <div className="mb-2 flex items-center justify-between border-b border-slate-700/70 pb-2">
        <span className="font-bold uppercase tracking-widest text-cyan-300">
          Network
        </span>
        <span className={connected ? "text-emerald-300" : "text-rose-300"}>
          {connected ? "connected" : "offline"}
        </span>
      </div>

      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">ping</dt>
        <dd>{ping}ms</dd>
        <dt className="text-slate-500">fps</dt>
        <dd>{fps}</dd>
        <dt className="text-slate-500">room</dt>
        <dd className="truncate">{roomId ?? "-"}</dd>
        <dt className="text-slate-500">player</dt>
        <dd className="truncate">{playerId ?? "-"}</dd>
        <dt className="text-slate-500">phase</dt>
        <dd>{gamePhase}</dd>
        <dt className="text-slate-500">remaining</dt>
        <dd>{Math.max(0, Math.ceil(timeRemaining / 1000))}s</dd>
        <dt className="text-slate-500">local hp</dt>
        <dd>{localPlayer ? localPlayer.health : "-"}</dd>
        <dt className="text-slate-500">remote</dt>
        <dd>{remotePlayers.size}</dd>
      </dl>
    </div>
  );
}
