/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BattleTelemetrySnapshot,
  CardProgressState,
  FactionId,
  MapBiomeId,
  RivalCommanderProfile,
} from './game/types';
import {
  CARDS_CATALOG,
  INITIAL_STARTING_ESSENCE,
  MATCH_DURATION_SEC,
  RIVAL_COMMANDERS,
  calculateCardUpgradeRequirements,
  resolveCardForFaction,
} from './game/rules';
import { ArmoniaSimulationEngine } from './game/engine';
import { soundEngine } from './game/audio';
import { GameHud } from './components/GameHud';
import { TitleScreen } from './components/TitleScreen';
import { AttributeLabModal, OutcomeModal, SanctumModal } from './components/StatusModal';

const INITIAL_CARD_PROGRESS: Record<string, CardProgressState> = Object.fromEntries(
  CARDS_CATALOG.map((c) => [c.id, { cardId: c.id, level: 1, duplicates: 3 }])
);

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [showTitleScreen, setShowTitleScreen] = useState<boolean>(!isAutostart);
  const [playerFactionId, setPlayerFactionId] = useState<FactionId>('martians');
  const [enemyFactionId, setEnemyFactionId] = useState<FactionId>('gonn');
  const [biomeId, setBiomeId] = useState<MapBiomeId>('map_korhal_basin');
  const [selectedRivalId, setSelectedRivalId] = useState<string>(RIVAL_COMMANDERS[0].id);

  // Meta-progression state
  const [cardLevels, setCardLevels] = useState<Record<string, CardProgressState>>(INITIAL_CARD_PROGRESS);
  const [trophies, setTrophies] = useState<number>(120);
  const [essenceShards, setEssenceShards] = useState<number>(150);
  const [unopenedChests, setUnopenedChests] = useState<number>(2);

  // Hand & Deck cycle state
  const [handCardIds, setHandCardIds] = useState<string[]>([
    'card_peon_lodge',
    'card_vanguard_barracks',
    'card_arcane_sanctum',
    'card_resonance_spire',
  ]);
  const [nextCardId, setNextCardId] = useState<string>('card_swift_rangers');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [isCameraTransformed, setIsCameraTransformed] = useState<boolean>(false);

  // Modals & UI flags
  const [showSanctumModal, setShowSanctumModal] = useState<boolean>(false);
  const [showLabModal, setShowLabModal] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<BattleTelemetrySnapshot>({
    playerEssence: INITIAL_STARTING_ESSENCE,
    enemyEssence: INITIAL_STARTING_ESSENCE,
    playerCitadelHp: 1840,
    playerCitadelMaxHp: 1840,
    enemyCitadelHp: 1840,
    enemyCitadelMaxHp: 1840,
    playerUnitCount: 0,
    enemyUnitCount: 0,
    playerHarvesterCount: 0,
    playerStructureCount: 1,
    enemyStructureCount: 1,
    dominationRatio: 50,
    remainingMatchSec: MATCH_DURATION_SEC,
    elapsedSec: 0,
    status: 'playing',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ArmoniaSimulationEngine>(new ArmoniaSimulationEngine());
  const rewardGrantedRef = useRef<boolean>(false);
  const dprRef = useRef<number>(2);

  // Multi-touch & Pan tracking refs on the canvas
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);
  const panGestureRef = useRef<{
    startX: number;
    startY: number;
    movedDistance: number;
    wasMultiTouch: boolean;
  }>({
    startX: 0,
    startY: 0,
    movedDistance: 0,
    wasMultiTouch: false,
  });

  const syncCameraTransformFlag = useCallback(() => {
    const engine = engineRef.current;
    const transformed =
      Math.abs(engine.cameraZoom - 1) > 0.03 ||
      Math.hypot(engine.cameraPanX, engine.cameraPanY) > 6;
    setIsCameraTransformed(transformed);
  }, []);

  const startOrResetBattle = useCallback(
    (overrideConfig?: {
      pFaction?: FactionId;
      eFaction?: FactionId;
      bId?: MapBiomeId;
      rId?: string;
    }) => {
      const pFaction = overrideConfig?.pFaction ?? playerFactionId;
      const eFaction = overrideConfig?.eFaction ?? enemyFactionId;
      const bId = overrideConfig?.bId ?? biomeId;

      rewardGrantedRef.current = false;
      setSelectedCardId(null);
      setDraggingCardId(null);
      setIsPaused(false);
      setIsCameraTransformed(false);

      const width = window.innerWidth;
      const height = window.innerHeight;

      engineRef.current.initSkirmish({
        width,
        height,
        playerFactionId: pFaction,
        enemyFactionId: eFaction,
        biomeId: bId,
        cardLevels,
      });

      setTelemetry(engineRef.current.getTelemetrySnapshot());
    },
    [playerFactionId, enemyFactionId, biomeId, cardLevels]
  );

  // Initialize simulation and animation loop with HiDPI / Retina supersampling
  useEffect(() => {
    startOrResetBattle();

    let animationFrameId: number;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Always render at minimum 2x HiDPI resolution for razor-sharp sprites
      const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 2));
      dprRef.current = dpr;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      engineRef.current.resize(window.innerWidth, window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      const engine = engineRef.current;
      engine.update(rawDt);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = dprRef.current;
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          engine.render(ctx);
          ctx.restore();
        }
      }

      hudSyncAccumulator += rawDt;
      if (hudSyncAccumulator >= 0.12) {
        hudSyncAccumulator = 0;
        const snap = engine.getTelemetrySnapshot();
        setTelemetry(snap);

        if (snap.status === 'victory' && !rewardGrantedRef.current) {
          rewardGrantedRef.current = true;
          const rival =
            RIVAL_COMMANDERS.find((r) => r.id === selectedRivalId) ?? RIVAL_COMMANDERS[0];
          setTrophies((t) => t + rival.trophyReward);
          setEssenceShards((s) => s + 65);
          setUnopenedChests((c) => c + 1);
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [startOrResetBattle, selectedRivalId]);

  // Keyboard shortcuts ([P] pause, [M] mute, [ESC] cancel card)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCardId(null);
        setDraggingCardId(null);
        engineRef.current.selectedCardId = null;
      } else if (e.key.toLowerCase() === 'p') {
        setIsPaused((prev) => {
          const next = !prev;
          engineRef.current.isPaused = next;
          return next;
        });
      } else if (e.key.toLowerCase() === 'm') {
        const muted = soundEngine.toggleMute();
        setIsMuted(muted);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectCard = useCallback((cardId: string | null) => {
    setSelectedCardId(cardId);
    engineRef.current.selectedCardId = cardId;
    if (cardId) soundEngine.playCardSelect();
  }, []);

  const tryDeployCardAtWorld = useCallback(
    (cardId: string, worldX: number, worldY: number): boolean => {
      const deployed = engineRef.current.deployCard('player', cardId, worldX, worldY);
      if (deployed) {
        setHandCardIds((prevHand) => {
          const usedIndex = prevHand.indexOf(cardId);
          if (usedIndex === -1) return prevHand;
          const nextHand = [...prevHand];
          nextHand[usedIndex] = nextCardId;

          const remainingPool = CARDS_CATALOG.map((c) => c.id).filter(
            (id) => !nextHand.includes(id)
          );
          const replacement =
            remainingPool[Math.floor(Math.random() * remainingPool.length)] ?? cardId;
          setNextCardId(replacement);
          return nextHand;
        });

        setSelectedCardId(null);
        engineRef.current.selectedCardId = null;
        setTelemetry(engineRef.current.getTelemetrySnapshot());
      }
      return deployed;
    },
    [nextCardId]
  );

  // Dual-mode Card Interaction: Tap-to-Select OR Drag-and-Drop onto the island
  const handleCardPointerDown = useCallback(
    (cardId: string, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();

      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragActive = false;

      const updateEnginePointerFromClient = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: -9999, y: -9999 };
        const rect = canvas.getBoundingClientRect();
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;
        const worldPos = engineRef.current.screenToWorld(screenX, screenY);
        engineRef.current.pointerWorldX = worldPos.x;
        engineRef.current.pointerWorldY = worldPos.y;
        return worldPos;
      };

      const onWindowPointerMove = (moveEvt: PointerEvent) => {
        if (moveEvt.pointerId !== pointerId) return;
        const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY);

        if (!isDragActive && dist > 8) {
          isDragActive = true;
          setDraggingCardId(cardId);
          setSelectedCardId(cardId);
          engineRef.current.selectedCardId = cardId;
          soundEngine.playCardSelect();
        }

        if (isDragActive) {
          updateEnginePointerFromClient(moveEvt.clientX, moveEvt.clientY);
        }
      };

      const cleanupListeners = () => {
        window.removeEventListener('pointermove', onWindowPointerMove);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerCancel);
      };

      const onWindowPointerUp = (upEvt: PointerEvent) => {
        if (upEvt.pointerId !== pointerId) return;
        cleanupListeners();

        if (isDragActive) {
          setDraggingCardId(null);
          const worldPos = updateEnginePointerFromClient(upEvt.clientX, upEvt.clientY);
          const deployed = tryDeployCardAtWorld(cardId, worldPos.x, worldPos.y);
          if (!deployed) {
            // Keep card selected if dropped back on dock or invalid tile so user can also tap to place
            engineRef.current.pointerWorldX = -9999;
            engineRef.current.pointerWorldY = -9999;
          }
        } else {
          // Short tap on card -> toggle selection for Tap-to-Place
          const nextSelected = selectedCardId === cardId ? null : cardId;
          handleSelectCard(nextSelected);
        }
      };

      const onWindowPointerCancel = (cancelEvt: PointerEvent) => {
        if (cancelEvt.pointerId !== pointerId) return;
        cleanupListeners();
        setDraggingCardId(null);
      };

      window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerCancel);
    },
    [selectedCardId, handleSelectCard, tryDeployCardAtWorld]
  );

  // Canvas Multi-Touch Pinch-to-Zoom, 1-Finger Pan & Tap-to-Place
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x, y });

    if (activePointersRef.current.size === 1) {
      panGestureRef.current = {
        startX: x,
        startY: y,
        movedDistance: 0,
        wasMultiTouch: false,
      };
      pinchDistanceRef.current = null;

      const worldPos = engineRef.current.screenToWorld(x, y);
      engineRef.current.pointerWorldX = worldPos.x;
      engineRef.current.pointerWorldY = worldPos.y;
    } else if (activePointersRef.current.size >= 2) {
      panGestureRef.current.wasMultiTouch = true;
      const pts = Array.from(activePointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!activePointersRef.current.has(e.pointerId)) {
      // Hovering with mouse (no button pressed)
      const worldPos = engineRef.current.screenToWorld(x, y);
      engineRef.current.pointerWorldX = worldPos.x;
      engineRef.current.pointerWorldY = worldPos.y;
      return;
    }

    const prev = activePointersRef.current.get(e.pointerId)!;
    activePointersRef.current.set(e.pointerId, { x, y });

    if (activePointersRef.current.size === 1 && !panGestureRef.current.wasMultiTouch) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      panGestureRef.current.movedDistance += Math.hypot(dx, dy);

      if (panGestureRef.current.movedDistance > 10) {
        engineRef.current.panByScreenDelta(dx, dy);
        syncCameraTransformFlag();
      }

      const worldPos = engineRef.current.screenToWorld(x, y);
      engineRef.current.pointerWorldX = worldPos.x;
      engineRef.current.pointerWorldY = worldPos.y;
    } else if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const p0 = pts[0];
      const p1 = pts[1];
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const midX = (p0.x + p1.x) * 0.5;
      const midY = (p0.y + p1.y) * 0.5;

      if (pinchDistanceRef.current && pinchDistanceRef.current > 8) {
        const scaleFactor = dist / pinchDistanceRef.current;
        const targetZoom = engineRef.current.cameraZoom * scaleFactor;
        engineRef.current.setZoomAtScreenPoint(targetZoom, midX, midY);
        syncCameraTransformFlag();
      }
      pinchDistanceRef.current = dist;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const wasTracking = activePointersRef.current.has(e.pointerId);
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchDistanceRef.current = null;
    }

    // If single finger/click released with minimal drag (<= 10px), treat as Tap-to-Place
    if (
      wasTracking &&
      activePointersRef.current.size === 0 &&
      !panGestureRef.current.wasMultiTouch &&
      panGestureRef.current.movedDistance <= 10 &&
      selectedCardId
    ) {
      const worldPos = engineRef.current.screenToWorld(x, y);
      tryDeployCardAtWorld(selectedCardId, worldPos.x, worldPos.y);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
    engineRef.current.setZoomAtScreenPoint(
      engineRef.current.cameraZoom * zoomFactor,
      x,
      y
    );
    syncCameraTransformFlag();
  };

  const handleZoomStep = (factor: number) => {
    const engine = engineRef.current;
    engine.setZoomAtScreenPoint(
      engine.cameraZoom * factor,
      engine.width * 0.5,
      engine.height * 0.5
    );
    syncCameraTransformFlag();
  };

  const handleResetCamera = () => {
    engineRef.current.resetCamera();
    syncCameraTransformFlag();
  };

  const handleChangeFaction = (newFaction: FactionId) => {
    setPlayerFactionId(newFaction);
    startOrResetBattle({ pFaction: newFaction });
  };

  const handleChangeBiome = (newBiome: MapBiomeId) => {
    setBiomeId(newBiome);
    startOrResetBattle({ bId: newBiome });
  };

  const handleSelectRival = (rival: RivalCommanderProfile) => {
    setSelectedRivalId(rival.id);
    setEnemyFactionId(rival.factionId);
    setBiomeId(rival.biomeId);
    startOrResetBattle({
      eFaction: rival.factionId,
      bId: rival.biomeId,
      rId: rival.id,
    });
  };

  const handleUpgradeCard = (cardId: string) => {
    const current = cardLevels[cardId] ?? { cardId, level: 1, duplicates: 0 };
    const req = calculateCardUpgradeRequirements(current.level);
    if (current.duplicates < req.duplicatesRequired || essenceShards < req.essenceShardCost) {
      return;
    }

    setEssenceShards((s) => s - req.essenceShardCost);
    setCardLevels((prev) => {
      const updated = {
        ...prev,
        [cardId]: {
          cardId,
          level: current.level + 1,
          duplicates: current.duplicates - req.duplicatesRequired,
        },
      };
      engineRef.current.cardLevels = updated;
      return updated;
    });
  };

  const handleOpenChest = (): string | null => {
    if (unopenedChests <= 0) return null;
    setUnopenedChests((c) => c - 1);

    const randomCardRaw = CARDS_CATALOG[Math.floor(Math.random() * CARDS_CATALOG.length)];
    const resolved = resolveCardForFaction(randomCardRaw, playerFactionId);
    const dupCount = 2 + Math.floor(Math.random() * 3);
    const bonusShards = 45 + Math.floor(Math.random() * 35);

    setEssenceShards((s) => s + bonusShards);
    setCardLevels((prev) => {
      const existing = prev[randomCardRaw.id] ?? { cardId: randomCardRaw.id, level: 1, duplicates: 0 };
      return {
        ...prev,
        [randomCardRaw.id]: {
          ...existing,
          duplicates: existing.duplicates + dupCount,
        },
      };
    });

    return `¡Obtenido: +${dupCount} cartas de ${resolved.name} y +${bonusShards} Fragmentos!`;
  };

  const activeRival =
    RIVAL_COMMANDERS.find((r) => r.id === selectedRivalId) ?? RIVAL_COMMANDERS[0];

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-slate-950 select-none touch-none">
      {/* Interactive 60fps HiDPI Canvas2D Battlefield with Pinch-to-Zoom & Touch Pan */}
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onWheel={handleCanvasWheel}
        className={`block w-full h-full touch-none ${
          selectedCardId ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {/* Tactical HUD Overlay */}
      <GameHud
        telemetry={telemetry}
        playerFactionId={playerFactionId}
        enemyFactionId={enemyFactionId}
        biomeId={biomeId}
        activeDeck={CARDS_CATALOG}
        handCardIds={handCardIds}
        nextCardId={nextCardId}
        selectedCardId={selectedCardId}
        draggingCardId={draggingCardId}
        cardLevels={cardLevels}
        trophies={trophies}
        essenceShards={essenceShards}
        isMuted={isMuted}
        isPaused={isPaused}
        selectedRivalId={selectedRivalId}
        isCameraTransformed={isCameraTransformed}
        onSelectCard={handleSelectCard}
        onCardPointerDown={handleCardPointerDown}
        onZoomIn={() => handleZoomStep(1.22)}
        onZoomOut={() => handleZoomStep(0.82)}
        onResetCamera={handleResetCamera}
        onChangeFaction={handleChangeFaction}
        onChangeBiome={handleChangeBiome}
        onSelectRival={handleSelectRival}
        onToggleMute={() => setIsMuted(soundEngine.toggleMute())}
        onTogglePause={() => {
          setIsPaused((prev) => {
            const next = !prev;
            engineRef.current.isPaused = next;
            return next;
          });
        }}
        onOpenSanctumModal={() => setShowSanctumModal(true)}
        onOpenLabModal={() => setShowLabModal(true)}
        onReturnTitle={() => setShowTitleScreen(true)}
      />

      {/* Title Screen Modal Overlay */}
      {showTitleScreen && (
        <TitleScreen
          selectedFaction={playerFactionId}
          selectedBiome={biomeId}
          onSelectFaction={handleChangeFaction}
          onSelectBiome={handleChangeBiome}
          onStartBattle={() => {
            setShowTitleScreen(false);
            startOrResetBattle();
          }}
          onOpenSanctum={() => {
            setShowTitleScreen(false);
            setShowSanctumModal(true);
          }}
          onOpenAttributeLab={() => setShowLabModal(true)}
        />
      )}

      {/* Sanctum Modal (Deck Upgrades & Rivals) */}
      {showSanctumModal && (
        <SanctumModal
          playerFactionId={playerFactionId}
          cardLevels={cardLevels}
          essenceShards={essenceShards}
          unopenedChests={unopenedChests}
          selectedRivalId={selectedRivalId}
          onUpgradeCard={handleUpgradeCard}
          onOpenChest={handleOpenChest}
          onSelectRival={(r) => {
            handleSelectRival(r);
            setShowSanctumModal(false);
          }}
          onClose={() => setShowSanctumModal(false)}
        />
      )}

      {/* Attribute, Ordered Traversal Domains & OpenSpec Lab Modal */}
      {showLabModal && <AttributeLabModal onClose={() => setShowLabModal(false)} />}

      {/* Victory / Defeat Modal */}
      {telemetry.status !== 'playing' && !showTitleScreen && (
        <OutcomeModal
          status={telemetry.status}
          playerFactionId={playerFactionId}
          rival={activeRival}
          elapsedSec={telemetry.elapsedSec}
          onPlayAgain={() => startOrResetBattle()}
          onOpenSanctum={() => {
            startOrResetBattle();
            setShowSanctumModal(true);
          }}
        />
      )}
    </main>
  );
}
