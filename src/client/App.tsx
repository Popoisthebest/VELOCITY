// ========================================
// Client App Root Component
// Switch between lobby (JoinScreen) and Arena (GameCanvas + HUD overlays)
// ========================================

import React from "react";
import { useGameStore } from "./store/gameStore.js";
import { JoinScreen } from "./ui/JoinScreen.js";
import { GameCanvas } from "./components/GameCanvas.js";
import { HUD } from "./ui/HUD.js";
import { Scoreboard } from "./components/Scoreboard.js";
import MobileControls from "./components/mobile/MobileControls.js";
import NetworkDebugOverlay from "./ui/NetworkDebugOverlay.js";
import { getInputMode } from "./utils/device.js";

export function App() {
  const inGame = useGameStore((state) => state.inGame);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden font-game text-slate-100 select-none">
      {!inGame ? (
        <JoinScreen />
      ) : (
        <>
          {/* Main 3D Canvas */}
          <GameCanvas />

          {/* HUD Status Bar & Overlays */}
          <HUD />

          <MobileControls />
          {/* Network debug overlay when ?netdebug=1 */}
          {new URLSearchParams(window.location.search).get("netdebug") === "1" && (
            <NetworkDebugOverlay />
          )}
          {/* Tab Scoreboard */}
          <Scoreboard />
        </>
      )}
    </div>
  );
}
export default App;
