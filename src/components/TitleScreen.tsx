/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FactionId, MapBiomeId } from '../game/types';
import { FACTIONS, MAP_BIOMES } from '../game/rules';
import { Play, Sliders, Layers, Shield, Zap, Sparkles } from 'lucide-react';

interface TitleScreenProps {
  selectedFaction: FactionId;
  selectedBiome: MapBiomeId;
  onSelectFaction: (id: FactionId) => void;
  onSelectBiome: (id: MapBiomeId) => void;
  onStartBattle: () => void;
  onOpenSanctum: () => void;
  onOpenAttributeLab: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedFaction,
  selectedBiome,
  onSelectFaction,
  onSelectBiome,
  onStartBattle,
  onOpenSanctum,
  onOpenAttributeLab,
}) => {
  const factionList = Object.values(FACTIONS);
  const biomeList = Object.values(MAP_BIOMES);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-2.5 sm:p-6 bg-slate-950/80 overflow-hidden select-none">
      <div className="max-w-3xl w-full max-h-[96dvh] bg-slate-900/95 border-2 border-slate-700/80 border-b-8 rounded-3xl p-4 sm:p-8 shadow-2xl text-slate-100 flex flex-col justify-between items-center text-center gap-3.5 sm:gap-6 overflow-hidden">
        {/* Clean Game Logo Header */}
        <div className="space-y-1 sm:space-y-1.5">
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-wider text-white drop-shadow-md">
            ARMONIA
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-300 max-w-md mx-auto leading-snug">
            Elige tu facción, despliega tus cartas en la isla y conquista la base rival.
          </p>
        </div>

        {/* 3 Touch-Friendly Faction Cards Side-by-Side (Zero Scroll on Mobile & Desktop) */}
        <div className="w-full space-y-1.5 sm:space-y-2.5">
          <div className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Elige tu Facción
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {factionList.map((f) => {
              const isSelected = f.id === selectedFaction;
              const shortFactionName = f.name
                .replace('Enjambre ', '')
                .replace('Dominio ', '')
                .replace('Cónclave ', '');
              return (
                <button
                  key={f.id}
                  onClick={() => onSelectFaction(f.id)}
                  className={`group p-2 sm:p-3.5 rounded-2xl sm:rounded-3xl border-2 border-b-4 transition-all flex flex-col items-center text-center gap-1.5 sm:gap-2.5 cursor-pointer active:translate-y-0.5 ${
                    isSelected
                      ? 'bg-slate-900 border-amber-400 shadow-[0_8px_24px_rgba(251,191,36,0.3)] -translate-y-0.5'
                      : 'bg-slate-950/75 border-slate-800 hover:border-slate-600 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div
                    className="w-full h-24 sm:h-36 rounded-xl sm:rounded-2xl overflow-hidden shadow-inner relative"
                    style={{
                      border: isSelected ? '2px solid #fbbf24' : `2px solid ${f.primaryColor}88`,
                      boxShadow: 'inset 0 0 18px rgba(0,0,0,0.85)',
                    }}
                  >
                    <img
                      src={f.avatarUrl}
                      alt={f.name}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/30 pointer-events-none" />
                    <span className="hidden sm:inline-block absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-950/85 text-amber-300 border border-amber-400/40 shadow">
                      {f.essentialResourceName}
                    </span>
                    <div className="absolute bottom-1.5 inset-x-1.5 sm:bottom-2 sm:inset-x-3 flex items-center justify-center sm:justify-between">
                      <span className="font-extrabold text-xs sm:text-base text-white drop-shadow truncate">
                        {shortFactionName}
                      </span>
                    </div>
                  </div>
                  <span className="sm:hidden text-[10px] font-bold text-amber-300/90 truncate max-w-full">
                    {f.essentialResourceName}
                  </span>
                  <p className="hidden sm:line-clamp-2 text-xs text-slate-300 leading-relaxed px-1">
                    {f.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3 Horizontal Map Selector Buttons */}
        <div className="w-full space-y-1.5 sm:space-y-2.5">
          <div className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Escenario de Isla
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {biomeList.map((b) => {
              const isSelected = b.id === selectedBiome;
              const shortName = b.name.split(' (')[0];
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBiome(b.id)}
                  className={`min-h-[44px] py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl border-2 border-b-4 font-extrabold text-xs sm:text-sm transition-all cursor-pointer active:translate-y-0.5 truncate ${
                    isSelected
                      ? 'bg-sky-500/20 border-sky-400 text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Play Action + Secondary Buttons (Fits in View Without Scroll) */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4 pt-1">
          <button
            onClick={onStartBattle}
            className="w-full sm:w-auto sm:min-w-[210px] min-h-[48px] flex items-center justify-center gap-2.5 px-8 py-3 sm:py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-base sm:text-lg border-b-4 border-amber-600 shadow-xl active:translate-y-0.5 transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
            ¡JUGAR!
          </button>

          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2.5 sm:gap-4">
            <button
              onClick={onOpenSanctum}
              className="w-full sm:w-auto min-h-[46px] flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs sm:text-sm border-2 border-slate-700 border-b-4 active:translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0" />
              Mazo y Cofres
            </button>

            <button
              onClick={onOpenAttributeLab}
              className="w-full sm:w-auto min-h-[46px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border-2 border-slate-700 border-b-4 active:translate-y-0.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300 shrink-0" />
              Laboratorio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
