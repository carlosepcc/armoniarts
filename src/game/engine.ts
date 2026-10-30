/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BattleTelemetrySnapshot,
  CardDefinition,
  CardProgressState,
  FactionId,
  MapBiomeId,
  ProjectileEntity,
  ResourceMaterialId,
  ResourceNodeEntity,
  SpellEffectEntity,
  SpriteVariantId,
  StructureEntity,
  TileCell,
  TileCoord,
  TileOffset,
  UnitArchetypeConfig,
  UnitEntity,
} from './types';
import {
  BASE_PASSIVE_ESSENCE_PER_SEC,
  CARDS_CATALOG,
  FACTIONS,
  FOOTPRINT_SHAPES,
  GRID_COLS,
  GRID_ROWS,
  INITIAL_STARTING_ESSENCE,
  MAP_BIOMES,
  MATCH_DURATION_SEC,
  MAX_ESSENCE_CAP,
  RESOURCE_MATERIALS,
  advanceStructureLifecycle,
  canPlaceStructureOnGrid,
  checkSkirmishOutcome,
  computeEffectiveAttributes,
  deriveExtractionRate,
  deriveUnitStats,
  findWalkablePathOnGrid,
  generateTilemapGrid,
  getFootprintTiles,
  getTileTraversalCost,
  isTileWalkableForUnit,
  isValidTileCoord,
  resolveCardForFaction,
  tileKey,
} from './rules';
import { soundEngine } from './audio';

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingBadge {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
}

const MAX_PARTICLES = 256;
const MAX_FLOATING_BADGES = 48;

export class ArmoniaSimulationEngine {
  public width: number = 1280;
  public height: number = 720;

  // Tilemap 24x32 geometry in screen space
  public gridOriginX: number = 0;
  public gridOriginY: number = 0;
  public tileSize: number = 22;
  public grid: TileCell[][] = [];

  public playerFactionId: FactionId = 'martians';
  public enemyFactionId: FactionId = 'gonn';
  public biomeId: MapBiomeId = 'map_korhal_basin';

  public playerEssence: number = INITIAL_STARTING_ESSENCE;
  public enemyEssence: number = INITIAL_STARTING_ESSENCE;
  public elapsedSec: number = 0;
  public status: 'playing' | 'victory' | 'defeat' = 'playing';
  public isPaused: boolean = false;

  public resourceNodes: ResourceNodeEntity[] = [];
  public structures: StructureEntity[] = [];
  public units: UnitEntity[] = [];
  public projectiles: ProjectileEntity[] = [];
  public spellEffects: SpellEffectEntity[] = [];

  public cardLevels: Record<string, CardProgressState> = {};

  public pointerWorldX: number = -1000;
  public pointerWorldY: number = -1000;
  public selectedCardId: string | null = null;

  // Interactive Camera Zoom & Pan State
  public cameraZoom: number = 1.0;
  public cameraPanX: number = 0;
  public cameraPanY: number = 0;

  private shakeTimer: number = 0;
  private shakeIntensity: number = 0;
  private hitstopTimer: number = 0;

  private aiDecisionTimer: number = 2.8;
  private entityCounter: number = 1;

  private particles: PooledParticle[] = [];
  private floatingBadges: FloatingBadge[] = [];
  private artImages: Map<string, HTMLImageElement> = new Map();

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#ffffff',
      });
    }
    for (let i = 0; i < MAX_FLOATING_BADGES; i++) {
      this.floatingBadges.push({
        active: false,
        x: 0,
        y: 0,
        vy: -20,
        life: 0,
        maxLife: 1,
        text: '',
        color: '#ffffff',
      });
    }
    this.preloadDotaPortraits();
  }

  private preloadDotaPortraits(): void {
    if (typeof Image === 'undefined') return;
    const urls = [
      '/assets/art/faction_gonn.png',
      '/assets/art/faction_martians.png',
      '/assets/art/faction_qentauri.png',
      '/assets/art/card_peon_lodge.png',
      '/assets/art/card_vanguard_barracks.png',
      '/assets/art/card_arcane_sanctum.png',
      '/assets/art/card_colossus_foundry.png',
      '/assets/art/card_resonance_spire.png',
      '/assets/art/card_swift_rangers.png',
      '/assets/art/card_spell_solar_barrage.png',
      '/assets/art/card_spell_harmony_aegis.png',
    ];
    for (const url of urls) {
      const img = new Image();
      img.src = url;
      this.artImages.set(url, img);
    }
  }

  public initSkirmish(config: {
    width: number;
    height: number;
    playerFactionId: FactionId;
    enemyFactionId: FactionId;
    biomeId: MapBiomeId;
    cardLevels: Record<string, CardProgressState>;
  }): void {
    this.width = config.width;
    this.height = config.height;
    this.playerFactionId = config.playerFactionId;
    this.enemyFactionId = config.enemyFactionId;
    this.biomeId = config.biomeId;
    this.cardLevels = config.cardLevels;

    this.playerEssence = INITIAL_STARTING_ESSENCE;
    this.enemyEssence = INITIAL_STARTING_ESSENCE;
    this.elapsedSec = 0;
    this.status = 'playing';
    this.isPaused = false;
    this.aiDecisionTimer = 3.2;

    this.cameraZoom = 1.0;
    this.cameraPanX = 0;
    this.cameraPanY = 0;

    this.resourceNodes = [];
    this.structures = [];
    this.units = [];
    this.projectiles = [];
    this.spellEffects = [];

    for (const p of this.particles) p.active = false;
    for (const b of this.floatingBadges) b.active = false;

    this.grid = generateTilemapGrid(this.biomeId);
    this.recomputeGridViewport();

    // 1. Blank start: only the two 2x2 Citadels (already constructed) on the 24x32 grid
    this.spawnCitadel('player', this.playerFactionId, 4, 26);
    this.spawnCitadel('enemy', this.enemyFactionId, 18, 4);

    // 2. Spawn 1x1 Resource Nodes on valid ground/mineral tiles
    this.populateBiomeResourceNodes();
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.recomputeGridViewport();
    this.clampCamera();
    for (const node of this.resourceNodes) {
      const pos = this.tileToWorldCenter(node.col, node.row);
      node.x = pos.x;
      node.y = pos.y;
    }
    for (const st of this.structures) {
      const pos = this.getFootprintWorldCenter(st.anchorCol, st.anchorRow, st.footprintOffsets);
      st.x = pos.x;
      st.y = pos.y;
      st.radius = st.isCitadel ? this.tileSize * 1.15 : this.tileSize * 0.88;
    }
  }

  private recomputeGridViewport(): void {
    const isMobile = this.width < 640;
    const topHudReserve = isMobile ? 52 : 62;
    const bottomHudReserve = isMobile ? 132 : 148;
    const availW = Math.max(240, this.width - (isMobile ? 8 : 20));
    const availH = Math.max(240, this.height - topHudReserve - bottomHudReserve);

    // Use sub-pixel precision so the island fills the available space crisply
    this.tileSize = Math.max(11, Number(Math.min(availW / GRID_COLS, availH / GRID_ROWS).toFixed(2)));
    const totalGridW = this.tileSize * GRID_COLS;
    const totalGridH = this.tileSize * GRID_ROWS;

    this.gridOriginX = Math.round((this.width - totalGridW) / 2);
    this.gridOriginY = Math.round(topHudReserve + (availH - totalGridH) / 2);
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const cx = this.width / 2;
    const cy = this.height / 2;
    return {
      x: (screenX - cx - this.cameraPanX) / this.cameraZoom + cx,
      y: (screenY - cy - this.cameraPanY) / this.cameraZoom + cy,
    };
  }

  public setZoomAtScreenPoint(targetZoom: number, focalScreenX: number, focalScreenY: number): void {
    const worldBefore = this.screenToWorld(focalScreenX, focalScreenY);
    this.cameraZoom = Math.max(1.0, Math.min(2.4, Number(targetZoom.toFixed(3))));
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.cameraPanX = focalScreenX - cx - (worldBefore.x - cx) * this.cameraZoom;
    this.cameraPanY = focalScreenY - cy - (worldBefore.y - cy) * this.cameraZoom;
    this.clampCamera();
  }

  public panByScreenDelta(dx: number, dy: number): void {
    this.cameraPanX += dx;
    this.cameraPanY += dy;
    this.clampCamera();
  }

  public resetCamera(): void {
    this.cameraZoom = 1.0;
    this.cameraPanX = 0;
    this.cameraPanY = 0;
  }

  public clampCamera(): void {
    const totalGridW = this.tileSize * GRID_COLS;
    const totalGridH = this.tileSize * GRID_ROWS;
    const maxPanX = Math.max(48, totalGridW * this.cameraZoom * 0.46);
    const maxPanY = Math.max(64, totalGridH * this.cameraZoom * 0.46);
    this.cameraPanX = Math.max(-maxPanX, Math.min(maxPanX, this.cameraPanX));
    this.cameraPanY = Math.max(-maxPanY, Math.min(maxPanY, this.cameraPanY));
  }

  public worldToTile(worldX: number, worldY: number): TileCoord {
    const col = Math.floor((worldX - this.gridOriginX) / this.tileSize);
    const row = Math.floor((worldY - this.gridOriginY) / this.tileSize);
    return { col, row };
  }

  public tileToWorldCenter(col: number, row: number): { x: number; y: number } {
    return {
      x: this.gridOriginX + (col + 0.5) * this.tileSize,
      y: this.gridOriginY + (row + 0.5) * this.tileSize,
    };
  }

  public getFootprintWorldCenter(
    anchorCol: number,
    anchorRow: number,
    offsets: TileOffset[]
  ): { x: number; y: number } {
    if (!offsets || offsets.length === 0) {
      return this.tileToWorldCenter(anchorCol, anchorRow);
    }
    let sumC = 0;
    let sumR = 0;
    for (const off of offsets) {
      sumC += anchorCol + off.dc + 0.5;
      sumR += anchorRow + off.dr + 0.5;
    }
    return {
      x: this.gridOriginX + (sumC / offsets.length) * this.tileSize,
      y: this.gridOriginY + (sumR / offsets.length) * this.tileSize,
    };
  }

  private nextId(prefix: string): string {
    this.entityCounter += 1;
    return `${prefix}_${this.entityCounter}`;
  }

  private spawnCitadel(
    owner: 'player' | 'enemy',
    factionId: FactionId,
    anchorCol: number,
    anchorRow: number
  ): void {
    const faction = FACTIONS[factionId];
    const baseAttrs = computeEffectiveAttributes(
      { strength: 24, agility: 12, mass: 115, intelligence: 22 },
      faction.attributeMultipliers,
      1,
      0
    );
    const maxHp = Math.round(baseAttrs.mass * 16);
    const offsets = FOOTPRINT_SHAPES.square_2x2;
    const center = this.getFootprintWorldCenter(anchorCol, anchorRow, offsets);

    const citadelName =
      factionId === 'gonn'
        ? 'Colmena Suprema'
        : factionId === 'martians'
        ? 'Centro de Mando'
        : 'Nexo Astral';

    this.structures.push({
      id: `citadel_${owner}`,
      owner,
      factionId,
      cardId: 'citadel',
      name: `${citadelName} (${faction.name})`,
      isCitadel: true,
      isDefenseTower: true,
      anchorCol,
      anchorRow,
      footprintOffsets: offsets,
      x: center.x,
      y: center.y,
      radius: this.tileSize * 1.15,
      hp: maxHp,
      maxHp,
      level: 1,
      attributes: baseAttrs,
      lifecycleState: 'active',
      buildDurationSec: 0,
      buildProgressSec: 0,
      initialSpawnCooldownSec: 0,
      spawnIntervalSec: 0,
      spawnTimerSec: 0,
      hasCompletedInitialCooldown: true,
      attackCooldownSec: 0,
      buffTimerSec: 0,
    });
  }

  private populateBiomeResourceNodes(): void {
    const biome = MAP_BIOMES[this.biomeId];
    const candidateCoords: TileCoord[] = [
      // Player SW mineral cluster
      { col: 3, row: 23 },
      { col: 5, row: 23 },
      { col: 8, row: 25 },
      { col: 8, row: 27 },
      { col: 4, row: 29 },
      { col: 7, row: 29 },
      // Enemy NE mineral cluster
      { col: 15, row: 3 },
      { col: 15, row: 5 },
      { col: 17, row: 8 },
      { col: 19, row: 8 },
      { col: 16, row: 2 },
      { col: 20, row: 6 },
      // Mid-map contested mineral pockets
      { col: 10, row: 14 },
      { col: 13, row: 14 },
      { col: 10, row: 17 },
      { col: 13, row: 17 },
      { col: 5, row: 14 },
      { col: 18, row: 17 },
    ];

    candidateCoords.forEach((coord, idx) => {
      if (
        !canPlaceStructureOnGrid(
          this.grid,
          coord.col,
          coord.row,
          FOOTPRINT_SHAPES.single_1x1,
          this.structures,
          this.resourceNodes,
          'martians'
        )
      ) {
        return;
      }

      const rule = biome.resourceRules[idx % biome.resourceRules.length];
      const material = RESOURCE_MATERIALS[rule.materialId];
      const spriteVariant: SpriteVariantId =
        rule.forcedSprite ?? material.spriteVariants[idx % material.spriteVariants.length];
      const pos = this.tileToWorldCenter(coord.col, coord.row);

      this.resourceNodes.push({
        id: this.nextId('node'),
        col: coord.col,
        row: coord.row,
        x: pos.x,
        y: pos.y,
        materialId: rule.materialId,
        spriteVariant,
        remainingAmount: 260,
        maxAmount: 260,
      });
    });
  }

  public canDeployCardAt(
    owner: 'player' | 'enemy',
    cardId: string,
    worldX: number,
    worldY: number
  ): boolean {
    const rawCard = CARDS_CATALOG.find((c) => c.id === cardId);
    if (!rawCard) return false;

    const essence = owner === 'player' ? this.playerEssence : this.enemyEssence;
    if (essence < rawCard.cost) return false;

    const tile = this.worldToTile(worldX, worldY);
    if (!isValidTileCoord(tile.col, tile.row)) return false;

    if (rawCard.category === 'spell') {
      return true;
    }

    if (rawCard.category === 'troop' && rawCard.unitArchetype) {
      return isTileWalkableForUnit(
        this.grid,
        tile.col,
        tile.row,
        rawCard.unitArchetype.traversableDomains
      );
    }

    const factionId = owner === 'player' ? this.playerFactionId : this.enemyFactionId;
    return canPlaceStructureOnGrid(
      this.grid,
      tile.col,
      tile.row,
      rawCard.footprintOffsets,
      this.structures,
      this.resourceNodes,
      factionId
    );
  }

  public deployCard(
    owner: 'player' | 'enemy',
    cardId: string,
    worldX: number,
    worldY: number
  ): boolean {
    const rawCard = CARDS_CATALOG.find((c) => c.id === cardId);
    if (!rawCard) return false;
    if (!this.canDeployCardAt(owner, cardId, worldX, worldY)) return false;

    if (owner === 'player') {
      this.playerEssence = Math.max(0, Number((this.playerEssence - rawCard.cost).toFixed(2)));
    } else {
      this.enemyEssence = Math.max(0, Number((this.enemyEssence - rawCard.cost).toFixed(2)));
    }

    const factionId = owner === 'player' ? this.playerFactionId : this.enemyFactionId;
    const card = resolveCardForFaction(rawCard, factionId);
    const level = owner === 'player' ? this.cardLevels[card.id]?.level ?? 1 : 1;
    const tile = this.worldToTile(worldX, worldY);

    if (card.category === 'spawner' || card.category === 'defense') {
      this.createStructureFromCard(owner, factionId, card, tile.col, tile.row, level);
      soundEngine.playDeploy();
    } else if (card.category === 'troop' && card.unitArchetype) {
      const count = card.spawnCount ?? 2;
      const center = this.tileToWorldCenter(tile.col, tile.row);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        this.spawnUnit(
          owner,
          factionId,
          card.unitArchetype,
          center.x + Math.cos(angle) * (this.tileSize * 0.35),
          center.y + Math.sin(angle) * (this.tileSize * 0.35),
          level
        );
      }
      soundEngine.playDeploy();
    } else if (card.category === 'spell') {
      const center = this.tileToWorldCenter(tile.col, tile.row);
      this.castSpellCard(owner, card, center.x, center.y, level);
      soundEngine.playSpell();
    }

    return true;
  }

  private createStructureFromCard(
    owner: 'player' | 'enemy',
    factionId: FactionId,
    card: CardDefinition,
    anchorCol: number,
    anchorRow: number,
    level: number
  ): void {
    const faction = FACTIONS[factionId];
    const rawAttrs = card.structureAttributes ?? {
      strength: 12,
      agility: 8,
      mass: 42,
      intelligence: 12,
    };
    const effAttrs = computeEffectiveAttributes(rawAttrs, faction.attributeMultipliers, level, 0);
    const maxHp = Math.round(effAttrs.mass * 14 + effAttrs.strength * 6);
    const center = this.getFootprintWorldCenter(anchorCol, anchorRow, card.footprintOffsets);

    const buildDurationSec = Math.max(0.5, card.buildDurationSec);
    const initialSpawnCooldownSec = Math.max(0.5, card.initialSpawnCooldownSec || card.spawnIntervalSec || 4);

    this.structures.push({
      id: this.nextId('struct'),
      owner,
      factionId,
      cardId: card.id,
      functionalRole: card.functionalRole,
      name: card.name,
      isCitadel: false,
      isDefenseTower: card.category === 'defense',
      anchorCol,
      anchorRow,
      footprintOffsets: card.footprintOffsets,
      x: center.x,
      y: center.y,
      radius: this.tileSize * 0.88,
      hp: maxHp,
      maxHp,
      level,
      attributes: effAttrs,
      lifecycleState: 'constructing',
      buildDurationSec,
      buildProgressSec: 0,
      initialSpawnCooldownSec,
      spawnIntervalSec: card.spawnIntervalSec ?? 9,
      spawnTimerSec: 0,
      hasCompletedInitialCooldown: false,
      unitArchetype: card.unitArchetype,
      attackCooldownSec: 0.5,
      buffTimerSec: 0,
    });

    this.emitBurst(center.x, center.y, faction.primaryColor, 14);
  }

  public spawnUnit(
    owner: 'player' | 'enemy',
    factionId: FactionId,
    archetype: UnitArchetypeConfig,
    x: number,
    y: number,
    level: number
  ): void {
    const faction = FACTIONS[factionId];
    const effAttrs = computeEffectiveAttributes(
      archetype.baseAttributes,
      faction.attributeMultipliers,
      level,
      0
    );
    const derived = deriveUnitStats(effAttrs, archetype.role, archetype.isRanged);
    const spawnPos = this.findNearestWalkableWorldPos(x, y, archetype.traversableDomains);

    this.units.push({
      id: this.nextId('unit'),
      owner,
      factionId,
      name: archetype.name,
      role: archetype.role,
      traversableDomains: [...archetype.traversableDomains],
      x: spawnPos.x,
      y: spawnPos.y,
      vx: 0,
      vy: owner === 'player' ? -1 : 1,
      radius: Math.max(7, this.tileSize * 0.42 * archetype.visualScale),
      hp: derived.maxHp,
      maxHp: derived.maxHp,
      level,
      isRanged: archetype.isRanged,
      baseAttributes: { ...archetype.baseAttributes },
      effectiveAttributes: effAttrs,
      carryingAmount: 0,
      carryingMaterialId: null,
      targetNodeId: null,
      attackCooldownSec: 0,
      buffTimerSec: 0,
      animPhase: Math.random() * Math.PI * 2,
      pathWaypoints: [],
      pathTargetKey: '',
    });

    this.emitBurst(spawnPos.x, spawnPos.y, faction.primaryColor, 8);
  }

  private findNearestWalkableWorldPos(
    worldX: number,
    worldY: number,
    traversableDomains = ['ground' as const]
  ): { x: number; y: number } {
    const startTile = this.worldToTile(worldX, worldY);
    if (isTileWalkableForUnit(this.grid, startTile.col, startTile.row, traversableDomains)) {
      return this.tileToWorldCenter(startTile.col, startTile.row);
    }

    for (let radius = 1; radius <= 5; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = startTile.col + dc;
          const r = startTile.row + dr;
          if (isTileWalkableForUnit(this.grid, c, r, traversableDomains)) {
            return this.tileToWorldCenter(c, r);
          }
        }
      }
    }
    return { x: worldX, y: worldY };
  }

  private castSpellCard(
    owner: 'player' | 'enemy',
    card: CardDefinition,
    x: number,
    y: number,
    level: number
  ): void {
    const radiusPx = (card.spellRadiusTiles ?? 2.5) * this.tileSize;
    const power = (card.spellPower ?? 100) * (1 + (level - 1) * 0.1);
    const effectType = card.spellEffect ?? 'orbital_strike';

    this.spellEffects.push({
      id: this.nextId('spell'),
      owner,
      type: effectType,
      x,
      y,
      radius: radiusPx,
      remainingSec: 1.15,
      maxDurationSec: 1.15,
    });

    if (effectType === 'orbital_strike') {
      this.triggerScreenShake(0.24, 5.5);
      this.hitstopTimer = 0.04;
      for (const u of this.units) {
        if (u.owner !== owner && Math.hypot(u.x - x, u.y - y) <= radiusPx) {
          u.hp -= power;
          this.emitBurst(u.x, u.y, '#f97316', 6);
        }
      }
      for (const st of this.structures) {
        if (st.owner !== owner && Math.hypot(st.x - x, st.y - y) <= radiusPx + st.radius) {
          st.hp -= power * 0.65;
          this.emitBurst(st.x, st.y, '#f97316', 10);
        }
      }
      this.emitFloatingBadge(x, y - 14, `-${Math.round(power)}`, '#fb923c');
    } else {
      for (const u of this.units) {
        if (u.owner === owner && Math.hypot(u.x - x, u.y - y) <= radiusPx) {
          u.hp = Math.min(u.maxHp, u.hp + power);
          u.buffTimerSec = 6.0;
          this.emitBurst(u.x, u.y, '#38bdf8', 6);
        }
      }
      for (const st of this.structures) {
        if (st.owner === owner && Math.hypot(st.x - x, st.y - y) <= radiusPx + st.radius) {
          st.hp = Math.min(st.maxHp, st.hp + power * 0.5);
          st.buffTimerSec = 6.0;
        }
      }
      this.emitFloatingBadge(x, y - 14, `+${Math.round(power)}`, '#38bdf8');
    }
  }

  public update(rawDt: number): void {
    if (this.isPaused || this.status !== 'playing') return;

    const dt = Math.min(rawDt, 0.1);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateParticlesAndBadges(dt * 0.35);
      return;
    }

    this.elapsedSec += dt;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    this.playerEssence = Math.min(
      MAX_ESSENCE_CAP,
      Number((this.playerEssence + BASE_PASSIVE_ESSENCE_PER_SEC * dt).toFixed(2))
    );
    this.enemyEssence = Math.min(
      MAX_ESSENCE_CAP,
      Number((this.enemyEssence + BASE_PASSIVE_ESSENCE_PER_SEC * dt).toFixed(2))
    );

    this.updateEnemyAi(dt);
    this.updateStructures(dt);
    this.updateUnits(dt);
    this.updateProjectiles(dt);
    this.updateSpellEffects(dt);
    this.cleanupAndCheckOutcome();
    this.updateParticlesAndBadges(dt);
  }

  private updateEnemyAi(dt: number): void {
    this.aiDecisionTimer -= dt;
    if (this.aiDecisionTimer > 0) return;
    this.aiDecisionTimer = 3.2;

    const enemyHarvesters = this.units.filter(
      (u) => u.owner === 'enemy' && u.role === 'harvester'
    ).length;
    const enemyLodgeCount = this.structures.filter(
      (s) => s.owner === 'enemy' && s.cardId === 'card_peon_lodge'
    ).length;

    let chosenCardId = 'card_vanguard_barracks';
    if (enemyHarvesters === 0 && enemyLodgeCount === 0) {
      chosenCardId = 'card_peon_lodge';
    } else {
      const pool = [
        'card_vanguard_barracks',
        'card_arcane_sanctum',
        'card_resonance_spire',
        'card_swift_rangers',
        'card_peon_lodge',
      ];
      chosenCardId = pool[Math.floor(Math.random() * pool.length)];
    }

    const card = CARDS_CATALOG.find((c) => c.id === chosenCardId);
    if (!card || this.enemyEssence < card.cost) return;

    for (let attempt = 0; attempt < 25; attempt++) {
      const col = 12 + Math.floor(Math.random() * 9);
      const row = 3 + Math.floor(Math.random() * 11);
      const pos = this.tileToWorldCenter(col, row);
      if (this.canDeployCardAt('enemy', chosenCardId, pos.x, pos.y)) {
        this.deployCard('enemy', chosenCardId, pos.x, pos.y);
        break;
      }
    }
  }

  private updateStructures(dt: number): void {
    for (const st of this.structures) {
      if (st.hp <= 0) continue;
      if (st.buffTimerSec > 0) {
        st.buffTimerSec = Math.max(0, st.buffTimerSec - dt);
      }

      const wasConstructing = st.lifecycleState === 'constructing';
      const step = advanceStructureLifecycle(st, dt);

      if (wasConstructing && st.lifecycleState === 'active') {
        const faction = FACTIONS[st.factionId];
        this.emitBurst(st.x, st.y, faction.primaryColor, 14);
      }

      if (step.shouldSpawnUnit && st.unitArchetype) {
        this.spawnUnit(
          st.owner,
          st.factionId,
          st.unitArchetype,
          st.x + (st.owner === 'player' ? 12 : -12),
          st.y + (st.owner === 'player' ? -12 : 12),
          st.level
        );
      }

      if (step.canAttack && st.isDefenseTower) {
        st.attackCooldownSec -= dt * (st.buffTimerSec > 0 ? 1.25 : 1);
        if (st.attackCooldownSec <= 0) {
          const stats = deriveUnitStats(st.attributes, 'ranged', true, this.tileSize);
          const range = stats.attackRangePx;
          const target = this.findClosestEnemyUnit(st.owner, st.x, st.y, range);
          if (target) {
            st.attackCooldownSec = stats.attackIntervalSec;
            const faction = FACTIONS[st.factionId];
            this.projectiles.push({
              id: this.nextId('proj'),
              owner: st.owner,
              x: st.x,
              y: st.y - 8,
              targetX: target.x,
              targetY: target.y,
              speed: 145,
              damage: stats.attackDamage,
              color: faction.primaryColor,
              splashRadius: 10,
            });
          } else {
            st.attackCooldownSec = 0.25;
          }
        }
      }
    }
  }

  private buildBlockedTilesSet(): Set<string> {
    const blocked = new Set<string>();
    for (const st of this.structures) {
      if (st.hp <= 0) continue;
      for (const t of getFootprintTiles(st.anchorCol, st.anchorRow, st.footprintOffsets)) {
        blocked.add(tileKey(t.col, t.row));
      }
    }
    for (const node of this.resourceNodes) {
      if (node.remainingAmount <= 0) continue;
      blocked.add(tileKey(node.col, node.row));
    }
    return blocked;
  }

  private updateUnits(dt: number): void {
    const blockedTiles = this.buildBlockedTilesSet();

    for (const u of this.units) {
      if (u.hp <= 0) continue;

      if (u.buffTimerSec > 0) {
        u.buffTimerSec = Math.max(0, u.buffTimerSec - dt);
      }

      const faction = FACTIONS[u.factionId];
      const matConfig = u.carryingMaterialId ? RESOURCE_MATERIALS[u.carryingMaterialId] : null;
      const carriedMass = matConfig ? u.carryingAmount * matConfig.unitMassPerLoad : 0;

      const effAttrs = computeEffectiveAttributes(
        u.baseAttributes,
        faction.attributeMultipliers,
        u.level,
        carriedMass
      );

      if (u.buffTimerSec > 0) {
        effAttrs.agility = Number((effAttrs.agility * 1.25).toFixed(2));
        effAttrs.strength = Number((effAttrs.strength * 1.2).toFixed(2));
      }

      u.effectiveAttributes = effAttrs;
      const stats = deriveUnitStats(effAttrs, u.role, u.isRanged, this.tileSize);
      u.animPhase += dt * (stats.moveSpeedPxPerSec * 0.22);

      if (u.role === 'harvester') {
        this.updateHarvesterUnit(u, stats, blockedTiles, dt);
      } else {
        this.updateCombatUnit(u, stats, blockedTiles, dt);
      }
    }
  }

  private updateHarvesterUnit(
    u: UnitEntity,
    stats: ReturnType<typeof deriveUnitStats>,
    blockedTiles: Set<string>,
    dt: number
  ): void {
    const homeCitadel = this.structures.find((s) => s.owner === u.owner && s.isCitadel);
    if (!homeCitadel) return;

    if (u.carryingAmount >= stats.carryCapacity) {
      const distHome = Math.hypot(homeCitadel.x - u.x, homeCitadel.y - u.y);
      if (distHome <= homeCitadel.radius + u.radius + 14) {
        const mat = u.carryingMaterialId
          ? RESOURCE_MATERIALS[u.carryingMaterialId]
          : RESOURCE_MATERIALS.res_unified_flux;
        const yieldEssence = Number((u.carryingAmount * mat.baseEssenceYield * 0.25).toFixed(2));

        if (u.owner === 'player') {
          this.playerEssence = Math.min(
            MAX_ESSENCE_CAP,
            Number((this.playerEssence + yieldEssence).toFixed(2))
          );
          soundEngine.playHarvestDeposit();
        } else {
          this.enemyEssence = Math.min(
            MAX_ESSENCE_CAP,
            Number((this.enemyEssence + yieldEssence).toFixed(2))
          );
        }

        const faction = FACTIONS[u.factionId];
        this.emitFloatingBadge(
          homeCitadel.x,
          homeCitadel.y - 24,
          `+${yieldEssence.toFixed(1)}`,
          faction.primaryColor
        );

        u.carryingAmount = 0;
        u.carryingMaterialId = null;
      } else {
        this.moveUnitAlongGridToward(u, homeCitadel.x, homeCitadel.y, stats.moveSpeedPxPerSec, blockedTiles, dt);
      }
      return;
    }

    let node = this.resourceNodes.find((n) => n.id === u.targetNodeId && n.remainingAmount > 0);
    if (!node) {
      node = this.findClosestResourceNode(u.x, u.y);
      u.targetNodeId = node ? node.id : null;
    }

    if (!node) {
      this.moveUnitAlongGridToward(
        u,
        homeCitadel.x + 24,
        homeCitadel.y,
        stats.moveSpeedPxPerSec,
        blockedTiles,
        dt
      );
      return;
    }

    const distNode = Math.hypot(node.x - u.x, node.y - u.y);
    if (distNode <= this.tileSize * 0.95 + u.radius) {
      const material = RESOURCE_MATERIALS[node.materialId];
      const extractionRate = deriveExtractionRate(u.effectiveAttributes, material);
      const harvested = Math.min(
        node.remainingAmount,
        stats.carryCapacity - u.carryingAmount,
        extractionRate * dt
      );

      node.remainingAmount = Math.max(0, node.remainingAmount - harvested);
      u.carryingAmount = Number((u.carryingAmount + harvested).toFixed(2));
      u.carryingMaterialId = node.materialId;

      if (Math.random() < 0.16) {
        this.emitBurst(node.x, node.y, FACTIONS[u.factionId].primaryColor, 2);
      }
    } else {
      this.moveUnitAlongGridToward(u, node.x, node.y, stats.moveSpeedPxPerSec, blockedTiles, dt);
    }
  }

  private updateCombatUnit(
    u: UnitEntity,
    stats: ReturnType<typeof deriveUnitStats>,
    blockedTiles: Set<string>,
    dt: number
  ): void {
    u.attackCooldownSec = Math.max(0, u.attackCooldownSec - dt);

    const enemyUnit =
      u.role === 'siege'
        ? null
        : this.findClosestEnemyUnit(u.owner, u.x, u.y, this.tileSize * 4.5);
    const enemyStruct = this.findClosestEnemyStructure(u.owner, u.x, u.y);

    const target = enemyUnit ?? enemyStruct;
    if (!target) return;

    const targetRadius = 'radius' in target ? target.radius : 10;
    const dist = Math.hypot(target.x - u.x, target.y - u.y);

    if (dist <= stats.attackRangePx + targetRadius * 0.65 + u.radius * 0.5) {
      if (u.attackCooldownSec <= 0) {
        u.attackCooldownSec = stats.attackIntervalSec;
        const faction = FACTIONS[u.factionId];

        if (u.isRanged) {
          this.projectiles.push({
            id: this.nextId('proj'),
            owner: u.owner,
            x: u.x,
            y: u.y,
            targetX: target.x,
            targetY: target.y,
            speed: 145,
            damage: stats.attackDamage,
            color: faction.primaryColor,
            splashRadius: 10,
          });
        } else {
          target.hp -= stats.attackDamage;
          this.emitBurst(target.x, target.y, faction.primaryColor, 4);
          if (u.owner === 'player') {
            soundEngine.playAttackHit();
          }
        }
      }
    } else {
      this.moveUnitAlongGridToward(u, target.x, target.y, stats.moveSpeedPxPerSec, blockedTiles, dt);
    }
  }

  private moveUnitAlongGridToward(
    u: UnitEntity,
    targetX: number,
    targetY: number,
    speedPxPerSec: number,
    blockedTiles: Set<string>,
    dt: number
  ): void {
    const startTile = this.worldToTile(u.x, u.y);
    const goalTile = this.worldToTile(targetX, targetY);
    const goalKey = tileKey(goalTile.col, goalTile.row);

    if (
      !u.pathWaypoints ||
      u.pathWaypoints.length === 0 ||
      u.pathTargetKey !== goalKey
    ) {
      u.pathWaypoints = findWalkablePathOnGrid(
        this.grid,
        startTile,
        goalTile,
        blockedTiles,
        u.traversableDomains
      );
      u.pathTargetKey = goalKey;
    }

    let moveTargetX = targetX;
    let moveTargetY = targetY;

    if (u.pathWaypoints && u.pathWaypoints.length > 0) {
      const nextStep = u.pathWaypoints[0];
      const stepWorld = this.tileToWorldCenter(nextStep.col, nextStep.row);
      moveTargetX = stepWorld.x;
      moveTargetY = stepWorld.y;

      if (Math.hypot(stepWorld.x - u.x, stepWorld.y - u.y) <= Math.max(4, this.tileSize * 0.28)) {
        u.pathWaypoints.shift();
      }
    }

    const dx = moveTargetX - u.x;
    const dy = moveTargetY - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const currentCell = this.grid[startTile.row]?.[startTile.col];
    const domainCost = getTileTraversalCost(currentCell, u.traversableDomains) ?? 1;
    const effectiveSpeed = speedPxPerSec / Math.pow(domainCost, 0.45);

    const step = Math.min(dist, effectiveSpeed * dt);
    const nextX = u.x + (dx / dist) * step;
    const nextY = u.y + (dy / dist) * step;
    const nextTile = this.worldToTile(nextX, nextY);

    if (isTileWalkableForUnit(this.grid, nextTile.col, nextTile.row, u.traversableDomains)) {
      u.vx = (dx / dist) * effectiveSpeed;
      u.vy = (dy / dist) * effectiveSpeed;
      u.x = nextX;
      u.y = nextY;
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= p.speed * dt + 6) {
        for (const u of this.units) {
          if (u.owner !== p.owner && Math.hypot(u.x - p.targetX, u.y - p.targetY) <= p.splashRadius + u.radius) {
            u.hp -= p.damage;
          }
        }
        for (const st of this.structures) {
          if (st.owner !== p.owner && Math.hypot(st.x - p.targetX, st.y - p.targetY) <= p.splashRadius + st.radius) {
            st.hp -= p.damage;
          }
        }
        this.emitBurst(p.targetX, p.targetY, p.color, 5);
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * p.speed * dt;
        p.y += (dy / dist) * p.speed * dt;
      }
    }
  }

  private updateSpellEffects(dt: number): void {
    for (let i = this.spellEffects.length - 1; i >= 0; i--) {
      const s = this.spellEffects[i];
      s.remainingSec -= dt;
      if (s.remainingSec <= 0) {
        this.spellEffects.splice(i, 1);
      }
    }
  }

  private cleanupAndCheckOutcome(): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      if (this.units[i].hp <= 0) {
        const dead = this.units[i];
        this.emitBurst(dead.x, dead.y, FACTIONS[dead.factionId].primaryColor, 9);
        this.units.splice(i, 1);
      }
    }

    for (let i = this.structures.length - 1; i >= 0; i--) {
      const st = this.structures[i];
      if (st.hp <= 0 && !st.isCitadel) {
        this.emitBurst(st.x, st.y, '#f97316', 18);
        this.triggerScreenShake(0.2, 4);
        this.structures.splice(i, 1);
      }
    }

    for (let i = this.resourceNodes.length - 1; i >= 0; i--) {
      if (this.resourceNodes[i].remainingAmount <= 0.5) {
        this.resourceNodes.splice(i, 1);
      }
    }

    const playerCitadel = this.structures.find((s) => s.owner === 'player' && s.isCitadel);
    const enemyCitadel = this.structures.find((s) => s.owner === 'enemy' && s.isCitadel);

    let outcome = checkSkirmishOutcome(playerCitadel?.hp ?? 0, enemyCitadel?.hp ?? 0);

    if (outcome === 'playing' && this.elapsedSec >= MATCH_DURATION_SEC) {
      const snap = this.getTelemetrySnapshot();
      outcome = snap.dominationRatio >= 50 ? 'victory' : 'defeat';
    }

    if (outcome !== 'playing' && this.status === 'playing') {
      this.status = outcome;
      if (outcome === 'victory') {
        soundEngine.playVictory();
      } else {
        soundEngine.playDefeat();
      }
    }
  }

  private findClosestResourceNode(x: number, y: number): ResourceNodeEntity | undefined {
    let best: ResourceNodeEntity | undefined;
    let bestDist = Infinity;
    for (const n of this.resourceNodes) {
      if (n.remainingAmount <= 0) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  private findClosestEnemyUnit(
    owner: 'player' | 'enemy',
    x: number,
    y: number,
    maxRange: number
  ): UnitEntity | undefined {
    let best: UnitEntity | undefined;
    let bestDist = maxRange;
    for (const u of this.units) {
      if (u.owner === owner || u.hp <= 0) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d <= bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  private findClosestEnemyStructure(
    owner: 'player' | 'enemy',
    x: number,
    y: number
  ): StructureEntity | undefined {
    let best: StructureEntity | undefined;
    let bestDist = Infinity;
    for (const s of this.structures) {
      if (s.owner === owner || s.hp <= 0) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  private triggerScreenShake(duration: number, intensity: number): void {
    this.shakeTimer = duration;
    this.shakeIntensity = intensity;
  }

  private emitBurst(x: number, y: number, color: string, count: number): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 18 + Math.random() * 65;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = 0;
        p.maxLife = 0.25 + Math.random() * 0.35;
        p.size = 2.5 + Math.random() * 3;
        p.color = color;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private emitFloatingBadge(x: number, y: number, text: string, color: string): void {
    for (const b of this.floatingBadges) {
      if (!b.active) {
        b.active = true;
        b.x = x;
        b.y = y;
        b.vy = -22;
        b.life = 0;
        b.maxLife = 1.1;
        b.text = text;
        b.color = color;
        break;
      }
    }
  }

  private updateParticlesAndBadges(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (const b of this.floatingBadges) {
      if (!b.active) continue;
      b.life += dt;
      if (b.life >= b.maxLife) {
        b.active = false;
      } else {
        b.y += b.vy * dt;
      }
    }
  }

  public getTelemetrySnapshot(): BattleTelemetrySnapshot {
    const playerCitadel = this.structures.find((s) => s.owner === 'player' && s.isCitadel);
    const enemyCitadel = this.structures.find((s) => s.owner === 'enemy' && s.isCitadel);

    const playerUnits = this.units.filter((u) => u.owner === 'player');
    const enemyUnits = this.units.filter((u) => u.owner === 'enemy');
    const playerStructures = this.structures.filter((s) => s.owner === 'player');
    const enemyStructures = this.structures.filter((s) => s.owner === 'enemy');

    const playerPower =
      (playerCitadel?.hp ?? 0) * 0.5 +
      playerStructures.length * 160 +
      playerUnits.length * 75;
    const enemyPower =
      (enemyCitadel?.hp ?? 0) * 0.5 +
      enemyStructures.length * 160 +
      enemyUnits.length * 75;
    const totalPower = Math.max(1, playerPower + enemyPower);
    const dominationRatio = Math.max(5, Math.min(95, Math.round((playerPower / totalPower) * 100)));

    return {
      playerEssence: this.playerEssence,
      enemyEssence: this.enemyEssence,
      playerCitadelHp: Math.max(0, Math.round(playerCitadel?.hp ?? 0)),
      playerCitadelMaxHp: playerCitadel?.maxHp ?? 1000,
      enemyCitadelHp: Math.max(0, Math.round(enemyCitadel?.hp ?? 0)),
      enemyCitadelMaxHp: enemyCitadel?.maxHp ?? 1000,
      playerUnitCount: playerUnits.length,
      enemyUnitCount: enemyUnits.length,
      playerHarvesterCount: playerUnits.filter((u) => u.role === 'harvester').length,
      playerStructureCount: playerStructures.length,
      enemyStructureCount: enemyStructures.length,
      dominationRatio,
      remainingMatchSec: Math.max(0, Math.ceil(MATCH_DURATION_SEC - this.elapsedSec)),
      elapsedSec: Math.floor(this.elapsedSec),
      status: this.status,
    };
  }

  // ==========================================================================
  // HIGH-DEFINITION VECTOR DIORAMA & SPRITE RENDERER (HiDPI 2x/3x)
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    const biome = MAP_BIOMES[this.biomeId];
    ctx.save();

    if (this.shakeTimer > 0) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const dy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.translate(dx, dy);
    }

    // 1. Clean ocean gradient (fills entire screen regardless of camera pan/zoom)
    const waterGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    if (this.biomeId === 'map_char_caldera') {
      waterGrad.addColorStop(0, '#1e2436');
      waterGrad.addColorStop(1, '#141824');
    } else if (this.biomeId === 'map_aiur_sanctuary') {
      waterGrad.addColorStop(0, '#133b5c');
      waterGrad.addColorStop(1, '#0d2840');
    } else {
      waterGrad.addColorStop(0, '#1b6ca8');
      waterGrad.addColorStop(1, '#124e78');
    }
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Apply Camera Zoom & Pan Transform around screen center
    const cx = this.width / 2;
    const cy = this.height / 2;
    ctx.translate(cx + this.cameraPanX, cy + this.cameraPanY);
    ctx.scale(this.cameraZoom, this.cameraZoom);
    ctx.translate(-cx, -cy);

    // 2. Render the 24x32 Diorama Island
    this.renderTilemap(ctx, biome);

    // 3. Render HD 1x1 Resource Nodes
    for (const node of this.resourceNodes) {
      this.renderResourceNode(ctx, node);
    }

    // 4. Render Polyomino Placement Preview when a card is selected
    if (this.selectedCardId) {
      this.renderCardPlacementOverlay(ctx, this.selectedCardId);
    }

    // 5. Render HD Faction Structures
    for (const st of this.structures) {
      this.renderStructure(ctx, st);
    }

    // 6. Render HD Character/Vehicle Units
    for (const u of this.units) {
      this.renderUnit(ctx, u);
    }

    // 7. Render Projectiles & Spells
    for (const p of this.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (const s of this.spellEffects) {
      const alpha = Math.max(0, s.remainingSec / s.maxDurationSec);
      ctx.strokeStyle =
        s.type === 'orbital_strike'
          ? `rgba(251, 146, 60, ${alpha})`
          : `rgba(56, 189, 248, ${alpha})`;
      ctx.fillStyle =
        s.type === 'orbital_strike'
          ? `rgba(251, 146, 60, ${alpha * 0.25})`
          : `rgba(56, 189, 248, ${alpha * 0.25})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 8. Particles & Floating Badges
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = '800 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    for (const b of this.floatingBadges) {
      if (!b.active) continue;
      ctx.globalAlpha = Math.max(0, 1 - b.life / b.maxLife);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillText(b.text, b.x + 1, b.y + 1);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, b.x, b.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private renderTilemap(
    ctx: CanvasRenderingContext2D,
    biome: (typeof MAP_BIOMES)[MapBiomeId]
  ): void {
    const ts = this.tileSize;
    const isPlacing = Boolean(this.selectedCardId);

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell || cell.terrain === 'void_water') continue;

        const x = this.gridOriginX + col * ts;
        const y = this.gridOriginY + row * ts;

        const southCell = this.grid[row + 1]?.[col];
        if (!southCell || southCell.terrain === 'void_water') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillRect(x, y + ts, ts + 0.6, Math.max(7, ts * 0.52));
          ctx.fillStyle = '#7c5841';
          ctx.fillRect(x, y + ts, ts + 0.6, Math.max(4.5, ts * 0.34));
        }
      }
    }

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell || cell.terrain === 'void_water') continue;

        const x = this.gridOriginX + col * ts;
        const y = this.gridOriginY + row * ts;

        if (cell.terrain === 'cliff_rock') {
          ctx.fillStyle = biome.cliffColor;
          ctx.fillRect(x, y, ts + 0.6, ts + 0.6);
          // Sculpted 3D rock top & shadow bevel
          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.fillRect(x + 1.5, y + 1.5, ts - 3, Math.max(2.5, ts * 0.22));
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.fillRect(x + 1.5, y + ts - Math.max(2.5, ts * 0.22), ts - 3, Math.max(2.5, ts * 0.22));
        } else if (cell.terrain === 'mineral_ground') {
          ctx.fillStyle = biome.mineralGroundColor;
          ctx.fillRect(x, y, ts + 0.6, ts + 0.6);
        } else {
          ctx.fillStyle = (col + row) % 2 === 0 ? biome.groundColor : biome.groundAccentColor;
          ctx.fillRect(x, y, ts + 0.6, ts + 0.6);
        }

        if (isPlacing && cell.buildable) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
        }
      }
    }
  }

  private renderCardPlacementOverlay(ctx: CanvasRenderingContext2D, cardId: string): void {
    const rawCard = CARDS_CATALOG.find((c) => c.id === cardId);
    if (!rawCard) return;

    const tile = this.worldToTile(this.pointerWorldX, this.pointerWorldY);
    if (!isValidTileCoord(tile.col, tile.row)) return;

    const isValid = this.canDeployCardAt('player', cardId, this.pointerWorldX, this.pointerWorldY);

    if (rawCard.category === 'spell') {
      const center = this.tileToWorldCenter(tile.col, tile.row);
      const radiusPx = (rawCard.spellRadiusTiles ?? 2.5) * this.tileSize;
      ctx.strokeStyle = isValid ? '#38bdf8' : '#fb7185';
      ctx.fillStyle = isValid ? 'rgba(56, 189, 248, 0.24)' : 'rgba(251, 113, 133, 0.24)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    const offsets = rawCard.footprintOffsets;
    const targetTiles = getFootprintTiles(tile.col, tile.row, offsets);

    for (const t of targetTiles) {
      if (!isValidTileCoord(t.col, t.row)) continue;
      const x = this.gridOriginX + t.col * this.tileSize;
      const y = this.gridOriginY + t.row * this.tileSize;

      ctx.fillStyle = isValid ? 'rgba(74, 222, 128, 0.45)' : 'rgba(251, 113, 133, 0.48)';
      ctx.strokeStyle = isValid ? '#ffffff' : '#fecdd3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, this.tileSize - 3, this.tileSize - 3, 4);
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * High-definition multi-layered vector sprite rendering for 1x1 Resource Nodes.
   */
  private renderResourceNode(ctx: CanvasRenderingContext2D, node: ResourceNodeEntity): void {
    const r = Math.max(8.5, this.tileSize * 0.56);
    ctx.save();
    ctx.translate(node.x, node.y);

    // Crisp ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.52, r * 0.82, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    if (node.spriteVariant === 'sprite_bio_tree') {
      // Trunk with bark shading
      ctx.fillStyle = '#5c2d0c';
      ctx.beginPath();
      ctx.roundRect(-r * 0.22, 0, r * 0.44, r * 0.58, 2);
      ctx.fill();

      // 3-tier lush canopy with dark outline & bright rim highlight
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 1.5;

      // Bottom foliage crown
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Mid foliage crown
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(-r * 0.12, -r * 0.34, r * 0.62, 0, Math.PI * 2);
      ctx.fill();

      // Top sunlight crown
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(-r * 0.22, -r * 0.48, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (node.spriteVariant === 'sprite_psionic_crystal') {
      // Multi-shard faceted Khaydarin crystal cluster
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.4;

      // Left shard
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.moveTo(-r * 0.65, r * 0.2);
      ctx.lineTo(-r * 0.55, -r * 0.55);
      ctx.lineTo(-r * 0.15, -r * 0.25);
      ctx.lineTo(-r * 0.2, r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right shard
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.moveTo(r * 0.2, r * 0.35);
      ctx.lineTo(r * 0.25, -r * 0.35);
      ctx.lineTo(r * 0.68, -r * 0.45);
      ctx.lineTo(r * 0.58, r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Central tall prism
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.98);
      ctx.lineTo(r * 0.44, -r * 0.15);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(-r * 0.44, -r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Specular inner facet highlight
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.92);
      ctx.lineTo(r * 0.18, -r * 0.18);
      ctx.lineTo(0, r * 0.2);
      ctx.lineTo(-r * 0.18, -r * 0.18);
      ctx.closePath();
      ctx.fill();
    } else if (node.spriteVariant === 'sprite_ferric_ore') {
      // Sculpted angular ore boulder with glowing gold veins
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.25);
      ctx.lineTo(-r * 0.55, -r * 0.55);
      ctx.lineTo(r * 0.15, -r * 0.72);
      ctx.lineTo(r * 0.75, -r * 0.2);
      ctx.lineTo(r * 0.58, r * 0.45);
      ctx.lineTo(-r * 0.2, r * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Upper rock plane
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, -r * 0.48);
      ctx.lineTo(r * 0.12, -r * 0.65);
      ctx.lineTo(r * 0.52, -r * 0.15);
      ctx.lineTo(-r * 0.1, r * 0.05);
      ctx.closePath();
      ctx.fill();

      // Golden metallic seams
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.15, r * 0.2, 0, Math.PI * 2);
      ctx.arc(r * 0.25, r * 0.12, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Bioluminescent spore geyser
      ctx.fillStyle = '#581c87';
      ctx.strokeStyle = '#3b0764';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.15, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.arc(r * 0.22, r * 0.15, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * High-definition vector structure sprites tailored by faction and functional role.
   */
  private renderStructure(ctx: CanvasRenderingContext2D, st: StructureEntity): void {
    const faction = FACTIONS[st.factionId];
    const isPlayer = st.owner === 'player';

    // Occupied polyomino tiles base platform
    for (const t of getFootprintTiles(st.anchorCol, st.anchorRow, st.footprintOffsets)) {
      const tx = this.gridOriginX + t.col * this.tileSize;
      const ty = this.gridOriginY + t.row * this.tileSize;
      ctx.fillStyle = isPlayer ? 'rgba(14, 165, 233, 0.24)' : 'rgba(244, 63, 94, 0.24)';
      ctx.strokeStyle = isPlayer ? 'rgba(56, 189, 248, 0.55)' : 'rgba(251, 113, 133, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(tx + 1.5, ty + 1.5, this.tileSize - 3, this.tileSize - 3, 4);
      ctx.fill();
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(st.x, st.y);

    const isConstructing = st.lifecycleState === 'constructing';
    const buildRatio =
      st.buildDurationSec > 0 ? Math.min(1, st.buildProgressSec / st.buildDurationSec) : 1;

    if (isConstructing) {
      ctx.globalAlpha = 0.55 + buildRatio * 0.4;
    }

    const r = st.radius * (isConstructing ? 0.78 + buildRatio * 0.22 : 1);
    const primaryAccent = isPlayer ? faction.primaryColor : '#fb7185';
    const secondaryFill = isPlayer ? '#1e293b' : '#3b1520';

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 1.02, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    if (st.factionId === 'gonn') {
      // Bio-organic Gonn Hive with chitin ribs & glowing mutagenic sacs
      ctx.fillStyle = isPlayer ? '#2e1065' : '#4c0519';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        const rad = r * (i % 2 === 0 ? 1.04 : 0.82);
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Organic carapace ridges
      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
        ctx.stroke();
      }
    } else if (st.factionId === 'martians') {
      // Terran-Martian octagonal armored steel bunker with corner bolts
      ctx.fillStyle = secondaryFill;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner armor plate
      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();

      // 4 structural armor struts
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4;
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Qentauri golden-crystal star matrix
      ctx.fillStyle = isPlayer ? '#0f172a' : '#3b1520';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const rad = i % 2 === 0 ? r * 1.08 : r * 0.65;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Center 3D Architectural Core / Structure Artwork Medallion (never a character face on a building)
    if (!st.isCitadel) {
      let structArtUrl = '/assets/art/card_vanguard_barracks.png';
      if (st.role === 'defense_tower') {
        structArtUrl = '/assets/art/card_resonance_spire.png';
      } else if (st.unitArchetype?.role === 'harvester') {
        structArtUrl = '/assets/art/card_peon_lodge.png';
      } else if (st.unitArchetype?.role === 'siege') {
        structArtUrl = '/assets/art/card_colossus_foundry.png';
      } else if (st.unitArchetype?.id.includes('caster')) {
        structArtUrl = '/assets/art/card_arcane_sanctum.png';
      } else if (st.unitArchetype?.role === 'ranged') {
        structArtUrl = '/assets/art/card_swift_rangers.png';
      }

      const portraitRadius = r * 0.68;
      const structImg = this.artImages.get(structArtUrl);

      if (structImg && structImg.complete && structImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, portraitRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          structImg,
          -portraitRadius,
          -portraitRadius,
          portraitRadius * 2,
          portraitRadius * 2
        );
        ctx.restore();
      }

      // 3D beveled architectural roof ring
      const roofGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, portraitRadius);
      roofGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      roofGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
      roofGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      ctx.fillStyle = roofGrad;
      ctx.beginPath();
      ctx.arc(0, 0, portraitRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(0, 0, portraitRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 3D-shaded Main Citadel Sanctum / Command Nexus / Hive Core
      const domeRadius = r * 0.68;
      const domeGrad = ctx.createRadialGradient(
        -domeRadius * 0.35,
        -domeRadius * 0.35,
        domeRadius * 0.08,
        0,
        0,
        domeRadius
      );
      if (st.factionId === 'gonn') {
        domeGrad.addColorStop(0, '#d8b4fe');
        domeGrad.addColorStop(0.45, '#7e22ce');
        domeGrad.addColorStop(1, '#2e1065');
      } else if (st.factionId === 'martians') {
        domeGrad.addColorStop(0, '#93c5fd');
        domeGrad.addColorStop(0.45, '#1d4ed8');
        domeGrad.addColorStop(1, '#0f172a');
      } else {
        domeGrad.addColorStop(0, '#fde68a');
        domeGrad.addColorStop(0.5, '#d97706');
        domeGrad.addColorStop(1, '#451a03');
      }
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(0, 0, domeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Glowing 3D energy core at the apex of the Citadel
      const coreR = r * 0.32;
      const coreGrad = ctx.createRadialGradient(-coreR * 0.25, -coreR * 0.25, 1, 0, 0, coreR);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.5, primaryAccent);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Clean rounded progress / HP bars
    const barW = Math.max(30, r * 1.8);
    if (isConstructing) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-barW / 2, r + 4, barW, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.roundRect(-barW / 2 + 1, r + 5, Math.max(4, (barW - 2) * buildRatio), 4, 2);
      ctx.fill();
    } else if (st.unitArchetype) {
      const targetCooldown = st.hasCompletedInitialCooldown
        ? Math.max(0.5, st.spawnIntervalSec)
        : Math.max(0.5, st.initialSpawnCooldownSec);
      const prodRatio = Math.min(1, st.spawnTimerSec / targetCooldown);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.roundRect(-barW / 2, r + 4, barW, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = st.hasCompletedInitialCooldown ? primaryAccent : '#c084fc';
      ctx.beginPath();
      ctx.roundRect(-barW / 2 + 1, r + 5, Math.max(3, (barW - 2) * prodRatio), 3, 1.5);
      ctx.fill();
    }

    if (st.hp < st.maxHp || st.isCitadel) {
      const hpRatio = Math.max(0, st.hp / st.maxHp);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-barW / 2, -r - 10, barW, 6, 3);
      ctx.fill();
      ctx.fillStyle = isPlayer ? '#4ade80' : '#fb7185';
      ctx.beginPath();
      ctx.roundRect(-barW / 2 + 1, -r - 9, Math.max(4, (barW - 2) * hpRatio), 4, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 3D-shaded character/vehicle unit renderer tailored to faction and combat role.
   */
  private renderUnit(ctx: CanvasRenderingContext2D, u: UnitEntity): void {
    const faction = FACTIONS[u.factionId];
    const isPlayer = u.owner === 'player';
    const primary = isPlayer ? faction.primaryColor : '#fb7185';

    ctx.save();
    ctx.translate(u.x, u.y);

    const bob = Math.sin(u.animPhase) * 1.4;
    const heading =
      Math.abs(u.vx) + Math.abs(u.vy) > 0.5
        ? Math.atan2(u.vy, u.vx)
        : isPlayer
        ? -Math.PI / 2
        : Math.PI / 2;

    const r = u.radius;

    // Soft volumetric ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.78, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotate unit chassis & weapons along movement/attack heading
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(heading);

    // 1. Role-specific weapons, treads, or harvesting claws
    if (u.role === 'harvester') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(r * 0.45, -r * 0.48);
      ctx.lineTo(r * 1.25, -r * 0.22);
      ctx.moveTo(r * 0.45, r * 0.48);
      ctx.lineTo(r * 1.25, r * 0.22);
      ctx.stroke();

      if (u.carryingAmount > 0) {
        const cargoGrad = ctx.createRadialGradient(-r * 0.9, -r * 0.1, 1, -r * 0.85, 0, r * 0.48);
        cargoGrad.addColorStop(0, '#ffffff');
        cargoGrad.addColorStop(0.5, '#38bdf8');
        cargoGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = cargoGrad;
        ctx.beginPath();
        ctx.arc(-r * 0.85, 0, r * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (u.role === 'ranged') {
      // Twin plasma rifle / rail barrel
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(r * 0.25, -2.2, r * 1.15, 4.4);
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(r * 1.38, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (u.role === 'siege') {
      // Heavy armored treads/legs + twin siege thermal cannons
      ctx.fillStyle = '#334155';
      ctx.fillRect(-r * 0.75, -r * 0.92, r * 1.5, r * 0.34);
      ctx.fillRect(-r * 0.75, r * 0.58, r * 1.5, r * 0.34);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(r * 0.25, -r * 0.62, r * 1.05, 3.8);
      ctx.fillRect(r * 0.25, r * 0.62 - 3.8, r * 1.05, 3.8);
    } else {
      // Melee energy blades / scythe claws
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 0.58);
      ctx.lineTo(r * 1.32, -r * 0.18);
      ctx.moveTo(r * 0.35, r * 0.58);
      ctx.lineTo(r * 1.32, r * 0.18);
      ctx.stroke();
    }

    // 2. 3D-shaded faction hull / carapace / armor body
    const bodyGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    if (u.factionId === 'gonn') {
      bodyGrad.addColorStop(0, isPlayer ? '#c084fc' : '#fda4af');
      bodyGrad.addColorStop(0.55, isPlayer ? '#6b21a8' : '#9f1239');
      bodyGrad.addColorStop(1, '#1e0936');
    } else if (u.factionId === 'martians') {
      bodyGrad.addColorStop(0, isPlayer ? '#93c5fd' : '#fda4af');
      bodyGrad.addColorStop(0.55, isPlayer ? '#1e40af' : '#9f1239');
      bodyGrad.addColorStop(1, '#0f172a');
    } else {
      bodyGrad.addColorStop(0, '#fef08a');
      bodyGrad.addColorStop(0.55, isPlayer ? '#ca8a04' : '#be123c');
      bodyGrad.addColorStop(1, '#271705');
    }

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (u.role === 'siege') {
      ctx.roundRect(-r * 0.85, -r * 0.72, r * 1.7, r * 1.44, 4);
    } else {
      ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // 3. Glowing visor / compound eyes / psionic crystal core facing forward
    ctx.fillStyle = isPlayer ? faction.secondaryColor : '#fecdd3';
    ctx.beginPath();
    ctx.arc(r * 0.34, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (u.hp < u.maxHp) {
      const hpW = Math.max(18, r * 2.1);
      const ratio = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-hpW / 2, -r - 9, hpW, 4.5, 2);
      ctx.fill();
      ctx.fillStyle = isPlayer ? '#4ade80' : '#fb7185';
      ctx.beginPath();
      ctx.roundRect(-hpW / 2, -r - 9, hpW * ratio, 4.5, 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
