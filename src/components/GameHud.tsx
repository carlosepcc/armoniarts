/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BattleTelemetrySnapshot,
  CardDefinition,
  CardProgressState,
  FactionId,
  MapBiomeId,
  RivalCommanderProfile,
} from '../game/types';
import {
  FACTIONS,
  MAX_ESSENCE_CAP,
  RIVAL_COMMANDERS,
  resolveCardForFaction,
} from '../game/rules';
import {
  Volume2,
  VolumeX,
  Sliders,
  Layers,
  Pause,
  Play,
  Home,
  ZoomIn,
  ZoomOut,
  LocateFixed,
} from 'lucide-react';

interface GameHudProps {
  telemetry: BattleTelemetrySnapshot;
  playerFactionId: FactionId;
  enemyFactionId: FactionId;
  biomeId: MapBiomeId;
  activeDeck: CardDefinition[];
  handCardIds: string[];
  nextCardId: string;
  selectedCardId: string | null;
  draggingCardId: string | null;
  cardLevels: Record<string, CardProgressState>;
  trophies: number;
  essenceShards: number;
  isMuted: boolean;
  isPaused: boolean;
  selectedRivalId: string;
  isCameraTransformed: boolean;
  onSelectCard: (cardId: string | null) => void;
  onCardPointerDown: (cardId: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onChangeFaction: (id: FactionId) => void;
  onChangeBiome: (id: MapBiomeId) => void;
  onSelectRival: (rival: RivalCommanderProfile) => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onOpenSanctumModal: () => void;
  onOpenLabModal: () => void;
  onReturnTitle: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  telemetry,
  playerFactionId,
  enemyFactionId,
  activeDeck,
  handCardIds,
  nextCardId,
  selectedCardId,
  draggingCardId,
  isMuted,
  isPaused,
  selectedRivalId,
  isCameraTransformed,
  onSelectCard,
  onCardPointerDown,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  onToggleMute,
  onTogglePause,
  onOpenSanctumModal,
  onOpenLabModal,
  onReturnTitle,
}) => {
  const playerFaction = FACTIONS[playerFactionId];
  const enemyFaction = FACTIONS[enemyFactionId];
  const rival = RIVAL_COMMANDERS.find((r) => r.id === selectedRivalId) ?? RIVAL_COMMANDERS[0];

  /**
   * Visual mini-grid indicator of the building's tile footprint (no technical text).
   */
  const renderFootprintMiniBlocks = (card: CardDefinition) => {
    if (card.category === 'spell') {
      return <div className="w-3 h-3 rounded-full border-2 border-fuchsia-300/80" />;
    }
    if (card.footprintShape === 'square_2x2') {
      return (
        <div className="grid grid-cols-2 gap-0.5">
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
        </div>
      );
    }
    if (card.footprintShape === 'bar_2x1') {
      return (
        <div className="flex gap-0.5">
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
          <span className="w-1.5 h-1.5 rounded-[1px] bg-white/85" />
        </div>
      );
    }
    return <span className="w-2 h-2 rounded-[2px] bg-white/85 block" />;
  };

  const getShortCardTitle = (fullName: string) => {
    const words = fullName.split(' ');
    if (words.length <= 2) return fullName;
    return `${words[0]} ${words[words.length - 1]}`;
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const nextCardRaw = activeDeck.find((c) => c.id === nextCardId) ?? activeDeck[0];
  const nextCard = nextCardRaw ? resolveCardForFaction(nextCardRaw, playerFactionId) : undefined;
  const totalSegments = MAX_ESSENCE_CAP;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2 sm:p-4 select-none">
      {/* =====================================================================
          TOP BAR: COMPACT SINGLE-ROW MOBILE & DESKTOP HUD
          ===================================================================== */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Top-Left: Rival Badge with Bitmap Portrait */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 border-b-2 sm:border-2 sm:border-b-4 rounded-xl sm:rounded-2xl px-2 py-1.5 sm:px-3.5 sm:py-2 shadow-lg min-w-0">
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl overflow-hidden shadow-inner shrink-0"
            style={{ border: `2px solid ${enemyFaction.primaryColor}` }}
          >
            <img
              src={enemyFaction.avatarUrl}
              alt={enemyFaction.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="hidden xs:block sm:block pr-1 min-w-0">
            <div className="text-[11px] sm:text-sm font-extrabold text-white leading-tight truncate max-w-[82px] sm:max-w-none">
              {rival.name}
            </div>
            <div className="text-[9px] sm:text-xs font-semibold text-rose-300 leading-tight truncate">
              {enemyFaction.name.replace('Enjambre ', '').replace('Dominio ', '').replace('Cónclave ', '')}
            </div>
          </div>
        </div>

        {/* Top-Center: Clean Domination Tug-of-War & Timer */}
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-slate-900/90 border border-slate-700/80 border-b-2 sm:border-2 sm:border-b-4 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-lg">
          <div className="w-16 sm:w-48 h-2.5 sm:h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 flex">
            <div
              className="h-full rounded-l-full transition-all duration-300"
              style={{
                width: `${telemetry.dominationRatio}%`,
                backgroundColor: playerFaction.primaryColor,
              }}
            />
            <div
              className="h-full rounded-r-full bg-rose-500 transition-all duration-300"
              style={{ width: `${100 - telemetry.dominationRatio}%` }}
            />
          </div>
          <div className="hud-number text-xs sm:text-base font-black text-white pl-1.5 sm:pl-2 border-l border-slate-700">
            {formatTimer(telemetry.remainingMatchSec)}
          </div>
        </div>

        {/* Top-Right: Ergonomic Touch Buttons */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2">
          {isCameraTransformed && (
            <button
              onClick={onResetCamera}
              title="Recentrar Isla"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-amber-500/95 hover:bg-amber-400 border border-amber-300 border-b-2 sm:border-2 sm:border-b-4 active:translate-y-0.5 flex items-center justify-center text-slate-950 shadow-lg transition-all cursor-pointer"
            >
              <LocateFixed className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <button
            onClick={onZoomIn}
            title="Acercar Mapa"
            className="hidden md:flex w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border-2 border-slate-700 border-b-4 active:translate-y-0.5 items-center justify-center text-slate-200 shadow-lg transition-all cursor-pointer"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <button
            onClick={onZoomOut}
            title="Alejar Mapa"
            className="hidden md:flex w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border-2 border-slate-700 border-b-4 active:translate-y-0.5 items-center justify-center text-slate-200 shadow-lg transition-all cursor-pointer"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenSanctumModal}
            title="Mazo y Cofres"
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 border-b-2 sm:border-2 sm:border-b-4 active:translate-y-0.5 flex items-center justify-center text-amber-300 shadow-lg transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={onOpenLabModal}
            title="Laboratorio"
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 border-b-2 sm:border-2 sm:border-b-4 active:translate-y-0.5 flex items-center justify-center text-sky-300 shadow-lg transition-all cursor-pointer"
          >
            <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={onTogglePause}
            title={isPaused ? 'Reanudar' : 'Pausar'}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 border-b-2 sm:border-2 sm:border-b-4 active:translate-y-0.5 flex items-center justify-center text-white shadow-lg transition-all cursor-pointer"
          >
            {isPaused ? (
              <Play className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 fill-current" />
            ) : (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>

          <button
            onClick={onToggleMute}
            title="Sonido"
            className="hidden sm:flex w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border-2 border-slate-700 border-b-4 active:translate-y-0.5 items-center justify-center text-white shadow-lg transition-all cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            onClick={onReturnTitle}
            title="Menú Principal"
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 border-b-2 sm:border-2 sm:border-b-4 active:translate-y-0.5 flex items-center justify-center text-slate-200 shadow-lg transition-all cursor-pointer"
          >
            <Home className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          BOTTOM DECK: ERGONOMIC THUMB DOCK (TAP OR DRAG TO DEPLOY)
          ===================================================================== */}
      <div className="flex flex-col items-center">
        <div className="pointer-events-auto flex items-center gap-2.5 sm:gap-4 bg-slate-900/92 border border-slate-700/80 border-b-2 sm:border-2 sm:border-b-4 rounded-2xl sm:rounded-3xl p-2 sm:p-3.5 shadow-2xl max-w-full">
          {/* NEXT Card Slot with Bitmap Artwork (Desktop/Tablet) */}
          {nextCard && (
            <div className="hidden sm:flex flex-col items-center pr-2 border-r border-slate-800">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                SIGUIENTE
              </span>
              <div className="relative w-14 h-18 rounded-xl bg-slate-950/90 border-2 border-slate-800 overflow-hidden flex flex-col items-center justify-center">
                <img
                  src={nextCard.artworkUrl}
                  alt={nextCard.name}
                  className="w-full h-full object-cover opacity-90"
                />
                <div className="absolute top-1 left-1 w-5 h-5 rounded-md bg-purple-600 border border-purple-300 text-[11px] font-black text-white flex items-center justify-center hud-number shadow">
                  {nextCard.cost}
                </div>
              </div>
            </div>
          )}

          {/* 4 Hand Cards + 15-Segment Resource Bar */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              {handCardIds.map((cardId, idx) => {
                const rawCard = activeDeck.find((c) => c.id === cardId) ?? activeDeck[idx];
                if (!rawCard) return null;
                const card = resolveCardForFaction(rawCard, playerFactionId);

                const canAfford = telemetry.playerEssence >= card.cost;
                const isSelected = selectedCardId === card.id;
                const isDragging = draggingCardId === card.id;
                const fillRatio = Math.min(1, telemetry.playerEssence / card.cost);

                return (
                  <button
                    key={`${card.id}_${idx}`}
                    type="button"
                    onPointerDown={(e) => onCardPointerDown(card.id, e)}
                    onClick={(e) => {
                      // Keyboard activation fallback (Enter / Space)
                      if (e.detail === 0) {
                        onSelectCard(isSelected ? null : card.id);
                      }
                    }}
                    className={`touch-none group relative w-[4.85rem] h-[6.1rem] sm:w-26 sm:h-32 rounded-xl sm:rounded-2xl border-2 border-b-4 transition-all flex flex-col items-center justify-between p-1.5 sm:p-2 overflow-hidden cursor-grab active:cursor-grabbing ${
                      isDragging
                        ? 'border-amber-300 bg-slate-900 scale-95 opacity-60 ring-2 ring-amber-300'
                        : isSelected
                        ? 'border-amber-400 bg-slate-900 -translate-y-2 shadow-[0_10px_24px_rgba(251,191,36,0.45)] ring-2 ring-amber-300/60'
                        : canAfford
                        ? 'border-amber-500/70 bg-slate-900 hover:-translate-y-1 shadow-[0_6px_16px_rgba(0,0,0,0.75)]'
                        : 'border-slate-800 bg-slate-950 opacity-65 saturate-50'
                    }`}
                  >
                    {/* Card Portrait Background */}
                    <img
                      src={card.artworkUrl}
                      alt={card.name}
                      className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-200 pointer-events-none"
                    />

                    {/* Metallic frame & bottom title plate gradient */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(2,6,23,0.45) 0%, rgba(2,6,23,0.0) 35%, rgba(2,6,23,0.55) 70%, rgba(2,6,23,0.95) 100%)',
                        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.85)',
                      }}
                    />

                    {/* Rising readiness fill when charging mana/essence */}
                    {!canAfford && (
                      <div
                        className="absolute inset-x-0 bottom-0 bg-amber-500/20 transition-all duration-150 pointer-events-none"
                        style={{ height: `${Math.round(fillRatio * 100)}%` }}
                      />
                    )}

                    {/* Top Row: Mana/Essence Cost Gem + Visual Shape Mini-Grid */}
                    <div className="relative z-10 w-full flex items-center justify-between pointer-events-none">
                      <span
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-black flex items-center justify-center hud-number shadow-md ${
                          canAfford
                            ? 'bg-gradient-to-b from-sky-500 to-blue-700 text-white border border-sky-300'
                            : 'bg-slate-950/90 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {card.cost}
                      </span>
                      <div className="p-1 rounded-md bg-slate-950/80 border border-amber-500/30">
                        {renderFootprintMiniBlocks(card)}
                      </div>
                    </div>

                    {/* Clean Short Card Title Plate */}
                    <div className="relative z-10 w-full text-center mt-auto pt-1 pointer-events-none">
                      <div className="text-[10px] sm:text-xs font-extrabold text-amber-50 drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)] leading-tight truncate">
                        {getShortCardTitle(card.name)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Clean 15-Segment Resource Bar */}
            <div className="flex items-center gap-2.5 bg-slate-950/90 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl border border-slate-800">
              <div className="flex-1 grid grid-cols-15 gap-0.5 sm:gap-1">
                {Array.from({ length: totalSegments }).map((_, idx) => {
                  const segNumber = idx + 1;
                  const isFilled = telemetry.playerEssence >= segNumber;
                  const isPartial =
                    !isFilled &&
                    telemetry.playerEssence > idx &&
                    telemetry.playerEssence < segNumber;
                  const partialPct = isPartial
                    ? Math.round((telemetry.playerEssence - idx) * 100)
                    : 0;

                  return (
                    <div
                      key={idx}
                      className="h-2.5 sm:h-3.5 w-full rounded-full bg-slate-800/90 overflow-hidden relative"
                    >
                      {isFilled && (
                        <div
                          className="w-full h-full rounded-full"
                          style={{ backgroundColor: playerFaction.primaryColor }}
                        />
                      )}
                      {isPartial && (
                        <div
                          className="h-full rounded-full transition-all duration-100"
                          style={{
                            width: `${partialPct}%`,
                            backgroundColor: playerFaction.primaryColor,
                            opacity: 0.65,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hud-number text-xs sm:text-sm font-black text-white min-w-[2.8rem] sm:min-w-[3.2rem] text-right">
                {Math.floor(telemetry.playerEssence)}/{MAX_ESSENCE_CAP}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
