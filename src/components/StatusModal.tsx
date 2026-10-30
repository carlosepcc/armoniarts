/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CardDefinition,
  CardProgressState,
  FactionId,
  ResourceMaterialConfig,
  ResourceMaterialId,
  RivalCommanderProfile,
  TraversalDomain,
} from '../game/types';
import {
  CARDS_CATALOG,
  FACTIONS,
  RESOURCE_MATERIALS,
  RIVAL_COMMANDERS,
  calculateCardUpgradeRequirements,
  computeEffectiveAttributes,
  deriveExtractionRate,
  deriveMovementSpeed,
  generateTilemapGrid,
  getTileTraversalCost,
  resolveCardForFaction,
} from '../game/rules';
import { X, RotateCcw, Trophy, ArrowUpCircle, Gift, Sliders, Layers } from 'lucide-react';

// ============================================================================
// 1. VICTORY / DEFEAT OUTCOME MODAL (CLEAN, GAME-LIKE)
// ============================================================================

interface OutcomeModalProps {
  status: 'victory' | 'defeat';
  playerFactionId: FactionId;
  rival: RivalCommanderProfile;
  elapsedSec: number;
  onPlayAgain: () => void;
  onOpenSanctum: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  status,
  playerFactionId,
  rival,
  onPlayAgain,
  onOpenSanctum,
}) => {
  const isVictory = status === 'victory';
  const faction = FACTIONS[playerFactionId];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 overflow-hidden select-none">
      <div className="max-w-md w-full max-h-[94dvh] bg-slate-900 border-2 border-slate-700 border-b-8 rounded-3xl p-6 sm:p-8 text-center shadow-2xl text-slate-100 flex flex-col justify-between gap-4 sm:gap-6 overflow-hidden">
        <div
          className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl flex items-center justify-center border-2 shrink-0 ${
            isVictory
              ? 'bg-amber-400/20 border-amber-400 text-amber-300'
              : 'bg-rose-500/20 border-rose-400 text-rose-300'
          }`}
        >
          <Trophy className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display text-2xl sm:text-4xl font-black text-white">
            {isVictory ? '¡VICTORIA!' : 'DERROTA'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            {isVictory
              ? `${faction.name} conquistó la isla de ${rival.name}.`
              : `${rival.name} resistió el asalto.`}
          </p>
        </div>

        {isVictory && (
          <div className="p-3 sm:p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-around text-xs sm:text-sm font-extrabold text-amber-300">
            <span>+{rival.trophyReward} Trofeos</span>
            <span>·</span>
            <span>+1 Cofre</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={onPlayAgain}
            className="min-h-[48px] flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm sm:text-base border-b-4 border-amber-600 active:translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            Jugar de Nuevo
          </button>
          <button
            onClick={onOpenSanctum}
            className="min-h-[48px] px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 border-b-4 text-sm font-extrabold text-white active:translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
          >
            Mazo y Cofres
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. SANCTUM MODAL: ZERO-SCROLL 4x2 DECK GRID, CHESTS & RIVALS
// ============================================================================

interface SanctumModalProps {
  playerFactionId: FactionId;
  cardLevels: Record<string, CardProgressState>;
  essenceShards: number;
  unopenedChests: number;
  selectedRivalId: string;
  onUpgradeCard: (cardId: string) => void;
  onOpenChest: () => string | null;
  onSelectRival: (rival: RivalCommanderProfile) => void;
  onClose: () => void;
}

export const SanctumModal: React.FC<SanctumModalProps> = ({
  playerFactionId,
  cardLevels,
  essenceShards,
  unopenedChests,
  selectedRivalId,
  onUpgradeCard,
  onOpenChest,
  onSelectRival,
  onClose,
}) => {
  const [lastChestReward, setLastChestReward] = useState<string | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string>(CARDS_CATALOG[0].id);
  const faction = FACTIONS[playerFactionId];

  const handleOpenChest = () => {
    const rewardMsg = onOpenChest();
    if (rewardMsg) setLastChestReward(rewardMsg);
  };

  const focusedRaw = CARDS_CATALOG.find((c) => c.id === focusedCardId) ?? CARDS_CATALOG[0];
  const focusedCard = resolveCardForFaction(focusedRaw, playerFactionId);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-5 bg-slate-950/85 overflow-hidden select-none">
      <div className="max-w-4xl w-full max-h-[96dvh] bg-slate-900 border-2 border-slate-700 border-b-8 rounded-3xl p-3.5 sm:p-6 shadow-2xl text-slate-100 flex flex-col justify-between gap-2.5 sm:gap-4 overflow-hidden">
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl overflow-hidden shadow-md shrink-0"
              style={{ border: `2px solid ${faction.primaryColor}` }}
            >
              <img
                src={faction.avatarUrl}
                alt={faction.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-xl font-black text-white truncate">
                Mazo — {faction.name}
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-amber-300 tabular-nums">
                Fragmentos: {essenceShards}
                {lastChestReward ? ` · ${lastChestReward}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 border-b-4 flex items-center justify-center text-slate-300 hover:text-white active:translate-y-0.5 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Chests & Rival Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center">
          <div className="sm:col-span-5 p-2.5 sm:p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold text-white tabular-nums">
                Cofres ({unopenedChests})
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {focusedCard.name}: {focusedCard.description}
              </div>
            </div>
            <button
              disabled={unopenedChests <= 0}
              onClick={handleOpenChest}
              className={`min-h-[42px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border-b-4 transition-all cursor-pointer active:translate-y-0.5 shrink-0 ${
                unopenedChests > 0
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-600'
                  : 'bg-slate-800 text-slate-500 border-slate-900 cursor-not-allowed'
              }`}
            >
              <Gift className="w-4 h-4" />
              Abrir
            </button>
          </div>

          <div className="sm:col-span-7 p-2.5 sm:p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2">
            <span className="hidden md:inline text-[11px] font-extrabold uppercase text-slate-400 shrink-0">
              Rival:
            </span>
            <div className="w-full grid grid-cols-3 gap-1.5 sm:gap-2">
              {RIVAL_COMMANDERS.map((r) => {
                const isSelected = r.id === selectedRivalId;
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectRival(r)}
                    className={`min-h-[40px] py-1.5 px-2 rounded-xl border-2 font-extrabold text-[11px] sm:text-xs transition-all cursor-pointer truncate ${
                      isSelected
                        ? 'bg-slate-800 border-amber-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4x2 Cards Grid — Fits all 8 Cards on Screen Without Scrolling */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {CARDS_CATALOG.map((rawCard: CardDefinition) => {
            const card = resolveCardForFaction(rawCard, playerFactionId);
            const prog = cardLevels[card.id] ?? { cardId: card.id, level: 1, duplicates: 2 };
            const req = calculateCardUpgradeRequirements(prog.level);
            const canUpgrade =
              prog.duplicates >= req.duplicatesRequired && essenceShards >= req.essenceShardCost;
            const isFocused = focusedCardId === card.id;
            const shortWords = card.name.split(' ');
            const shortTitle =
              shortWords.length <= 2
                ? card.name
                : `${shortWords[0]} ${shortWords[shortWords.length - 1]}`;

            return (
              <div
                key={card.id}
                onClick={() => setFocusedCardId(card.id)}
                className={`p-1.5 sm:p-2.5 rounded-2xl bg-slate-950/85 border-2 flex flex-col justify-between gap-1.5 sm:gap-2 cursor-pointer transition-colors ${
                  isFocused ? 'border-amber-400/80' : 'border-slate-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="relative w-full h-16 sm:h-24 rounded-xl overflow-hidden border border-slate-700/80">
                    <img
                      src={card.artworkUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-slate-950/85 border border-amber-400/50 text-[9px] sm:text-[11px] font-black text-amber-300 tabular-nums">
                      Nv.{prog.level}
                    </span>
                    <span className="absolute top-1 right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-purple-600 border border-purple-300 text-[10px] sm:text-xs font-black text-white flex items-center justify-center hud-number shadow">
                      {card.cost}
                    </span>
                  </div>
                  <div className="text-[10px] sm:text-xs font-extrabold text-white leading-tight truncate px-0.5">
                    {shortTitle}
                  </div>
                  <p className="hidden sm:line-clamp-1 text-[11px] text-slate-400 px-0.5">
                    {card.description}
                  </p>
                </div>

                <button
                  disabled={!canUpgrade}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpgradeCard(card.id);
                  }}
                  className={`w-full min-h-[36px] sm:min-h-[40px] flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-[10px] sm:text-xs font-black border-b-4 transition-all cursor-pointer active:translate-y-0.5 tabular-nums whitespace-nowrap ${
                    canUpgrade
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-emerald-600'
                      : 'bg-slate-800 text-slate-500 border-slate-900 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-3.5 h-3.5 hidden sm:inline shrink-0" />
                  <span>+{req.essenceShardCost}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. ZERO-SCROLL TOUCH-FRIENDLY ATTRIBUTE & TRAVERSAL LAB MODAL
// ============================================================================

interface AttributeLabModalProps {
  onClose: () => void;
}

export const AttributeLabModal: React.FC<AttributeLabModalProps> = ({ onClose }) => {
  const [testFactionId, setTestFactionId] = useState<FactionId>('qentauri');
  const [testMaterialId, setTestMaterialId] = useState<ResourceMaterialId>('res_khaydarin_crystal');
  const [domainOrderPreset, setDomainOrderPreset] = useState<
    'ground_only' | 'ground_water' | 'water_ground'
  >('ground_water');

  const faction = FACTIONS[testFactionId];
  const basePeonAttrs = { strength: 11, agility: 14, mass: 8, intelligence: 11 };
  const effUnloaded = computeEffectiveAttributes(basePeonAttrs, faction.attributeMultipliers, 1, 0);
  const material: ResourceMaterialConfig = RESOURCE_MATERIALS[testMaterialId];

  const moveSpeed = deriveMovementSpeed(effUnloaded);
  const extractionRate = deriveExtractionRate(effUnloaded, material);

  const sampleGrid = generateTilemapGrid('map_korhal_basin');
  const domainsList: TraversalDomain[] =
    domainOrderPreset === 'ground_only'
      ? ['ground']
      : domainOrderPreset === 'ground_water'
      ? ['ground', 'water']
      : ['water', 'ground'];

  const groundCost = getTileTraversalCost(sampleGrid[10][10], domainsList);
  const waterCost = getTileTraversalCost(sampleGrid[0][0], domainsList);
  const cliffCost = getTileTraversalCost(sampleGrid[15][7], domainsList);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2.5 sm:p-6 bg-slate-950/85 overflow-hidden select-none">
      <div className="max-w-2xl w-full max-h-[96dvh] bg-slate-900 border-2 border-slate-700 border-b-8 rounded-3xl p-4 sm:p-7 shadow-2xl text-slate-100 flex flex-col justify-between gap-3.5 sm:gap-5 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-sky-400/20 border-2 border-sky-400 flex items-center justify-center text-sky-300 shrink-0">
              <Sliders className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-2xl font-black text-white">
                Simulador de Reglas
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Atributos de facción y orden de terrenos preferidos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 border-b-4 flex items-center justify-center text-slate-300 hover:text-white active:translate-y-0.5 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Faction Selector */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-extrabold uppercase text-slate-400">Facción</div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Object.values(FACTIONS).map((f) => (
              <button
                key={f.id}
                onClick={() => setTestFactionId(f.id)}
                className={`min-h-[44px] py-2 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl border-2 font-extrabold text-xs sm:text-sm cursor-pointer truncate ${
                  testFactionId === f.id
                    ? 'bg-slate-800 border-amber-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                {f.name.replace('Enjambre ', '').replace('Dominio ', '').replace('Cónclave ', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Resource Selector */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-extrabold uppercase text-slate-400">Tipo de Recurso</div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {Object.values(RESOURCE_MATERIALS).map((m) => (
              <button
                key={m.id}
                onClick={() => setTestMaterialId(m.id)}
                className={`min-h-[44px] py-2 sm:py-3 px-2.5 sm:px-4 rounded-xl sm:rounded-2xl border-2 font-bold text-xs cursor-pointer truncate ${
                  testMaterialId === m.id
                    ? 'bg-slate-800 border-sky-400 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Ordered Domains */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-extrabold uppercase text-slate-400">
            Orden de Terrenos Transitables
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={() => setDomainOrderPreset('ground_only')}
              className={`min-h-[44px] py-2 sm:py-3 px-2 rounded-xl sm:rounded-2xl border-2 text-[11px] sm:text-xs font-extrabold cursor-pointer truncate ${
                domainOrderPreset === 'ground_only'
                  ? 'bg-slate-800 border-emerald-400 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              Sólo Tierra
            </button>
            <button
              onClick={() => setDomainOrderPreset('ground_water')}
              className={`min-h-[44px] py-2 sm:py-3 px-2 rounded-xl sm:rounded-2xl border-2 text-[11px] sm:text-xs font-extrabold cursor-pointer truncate ${
                domainOrderPreset === 'ground_water'
                  ? 'bg-slate-800 border-emerald-400 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              1º Tierra, 2º Agua
            </button>
            <button
              onClick={() => setDomainOrderPreset('water_ground')}
              className={`min-h-[44px] py-2 sm:py-3 px-2 rounded-xl sm:rounded-2xl border-2 text-[11px] sm:text-xs font-extrabold cursor-pointer truncate ${
                domainOrderPreset === 'water_ground'
                  ? 'bg-slate-800 border-emerald-400 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
            >
              1º Agua, 2º Tierra
            </button>
          </div>
        </div>

        {/* Clean Results Summary */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-1">
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs text-slate-400 font-bold">Velocidad</div>
            <div className="text-sm sm:text-lg font-black text-emerald-300 mt-0.5 tabular-nums">
              {moveSpeed} px/s
            </div>
          </div>
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs text-slate-400 font-bold">Extracción</div>
            <div className="text-sm sm:text-lg font-black text-sky-300 mt-0.5 tabular-nums">
              {extractionRate} /s
            </div>
          </div>
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs text-slate-400 font-bold">Peso (T/A/R)</div>
            <div className="text-xs sm:text-sm font-black text-amber-300 mt-1 tabular-nums">
              {groundCost ?? '—'}/{waterCost ?? '—'}/{cliffCost ?? '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
