/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FactionId = 'gonn' | 'martians' | 'qentauri';

export type ResourceMaterialId =
  | 'res_unified_flux'
  | 'res_vespene_flora'
  | 'res_khaydarin_crystal'
  | 'res_martian_ore';

export type SpriteVariantId =
  | 'sprite_bio_tree'
  | 'sprite_psionic_crystal'
  | 'sprite_ferric_ore'
  | 'sprite_spore_geyser';

export type MapBiomeId =
  | 'map_korhal_basin'
  | 'map_char_caldera'
  | 'map_aiur_sanctuary';

export type TerrainType =
  | 'void_water'
  | 'cliff_rock'
  | 'ground_plain'
  | 'mineral_ground';

/**
 * Physical traversal domains.
 * Units declare an ordered array `traversableDomains: TraversalDomain[]` from MOST preferred
 * to LEAST preferred (e.g., `['ground']`, `['ground', 'water']`, `['water', 'ground']`, `['air']`).
 * Pathfinding applies increasing traversal weights according to the domain's index in the list.
 */
export type TraversalDomain = 'ground' | 'water' | 'cliff' | 'air';

/**
 * Grid coordinates on the 24x32 tilemap.
 */
export interface TileCoord {
  col: number;
  row: number;
}

/**
 * Relative tile offset from a structure's anchor (col, row).
 * Enables 1x1, 2x1, 2x2, or arbitrary Tetris polyomino shapes (L, T, Z, etc.).
 */
export interface TileOffset {
  dc: number;
  dr: number;
}

export type FootprintShapeId =
  | 'single_1x1'
  | 'bar_2x1'
  | 'square_2x2'
  | 'tetromino_L'
  | 'tetromino_T'
  | 'tetromino_Z';

export interface TileCell {
  col: number;
  row: number;
  terrain: TerrainType;
  domain: Exclude<TraversalDomain, 'air'>;
  walkable: boolean;
  buildable: boolean;
  elevation: number; // 0 = water, 1 = ground, 2 = cliff
}

/**
 * Pure Fundamental Attributes:
 * Entities NEVER store hardcoded movement speeds, harvesting rates, or attack speeds.
 * Every dynamic rate is derived from these 4 base attributes.
 */
export interface FundamentalAttributes {
  strength: number;     // Fuerza: physical damage, piercing hard materials, carry capacity
  agility: number;      // Agilidad: movement impulse, attack & harvest cadence
  mass: number;         // Masa/Peso: HP pool, knockback resistance, inertia penalty
  intelligence: number; // Inteligencia: arcane/psionic extraction efficiency, range & spell power
}

export type UnitRole = 'harvester' | 'melee' | 'ranged' | 'siege';

/**
 * Layer 1: Functional Card Role (shared tactical mechanics across factions).
 */
export type FunctionalRoleId =
  | 'role_harvester_camp'
  | 'role_melee_spawner'
  | 'role_ranged_spawner'
  | 'role_heavy_spawner'
  | 'role_defense_turret'
  | 'role_vanguard_drop'
  | 'role_orbital_strike'
  | 'role_overcharge_shield';

/**
 * Layer 2: Faction-specific presentation and optional stat/footprint overrides.
 */
export interface FactionRoleSkin {
  name: string;
  unitName?: string;
  description: string;
  visualStyle: 'gonn_hive' | 'martian_bunker' | 'qentauri_pylon';
}

export interface FactionConfig {
  id: FactionId;
  name: string;
  inspirationTag: string;
  tagline: string;
  lore: string;
  essentialResourceName: string;
  essentialResourceUnit: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  avatarUrl: string;
  architectureStyle: 'bio_chitin' | 'terran_steel' | 'psionic_crystal';
  attributeMultipliers: FundamentalAttributes;
  roleSkins: Record<FunctionalRoleId, FactionRoleSkin>;
}

export interface ResourceMaterialConfig {
  id: ResourceMaterialId;
  name: string;
  description: string;
  hardness: number;         // Physical resistance (countered by Strength)
  arcaneComplexity: number; // Psionic/Arcane stability needed (countered by Intelligence)
  baseEssenceYield: number; // Tribute into the faction's unified Essential Resource bar
  unitMassPerLoad: number;  // Added mass per harvested unit carried
  spriteVariants: SpriteVariantId[];
}

export interface MapResourceSpawnRule {
  materialId: ResourceMaterialId;
  weight: number;
  forcedSprite?: SpriteVariantId;
}

export interface MapBiomeConfig {
  id: MapBiomeId;
  name: string;
  subtitle: string;
  description: string;
  waterColor: string;
  groundColor: string;
  groundAccentColor: string;
  cliffColor: string;
  mineralGroundColor: string;
  resourceRules: MapResourceSpawnRule[];
}

export type CardCategory = 'spawner' | 'defense' | 'troop' | 'spell';

export interface UnitArchetypeConfig {
  id: string;
  name: string;
  role: UnitRole;
  /**
   * Ordered list of traversal domains from MOST preferred (index 0) to LEAST preferred.
   * Example: ['ground'] for terrestrial units, ['ground', 'water'] for units that can cross water with higher cost.
   */
  traversableDomains: TraversalDomain[];
  baseAttributes: FundamentalAttributes;
  isRanged: boolean;
  visualScale: number;
}

export interface CardDefinition {
  id: string;
  functionalRole: FunctionalRoleId;
  name: string;
  category: CardCategory;
  cost: number;
  artworkUrl: string;
  description: string;
  footprintShape: FootprintShapeId;
  footprintOffsets: TileOffset[];
  /**
   * Time in seconds required to construct the building on the tilemap before it becomes active.
   */
  buildDurationSec: number;
  /**
   * Once construction finishes, time in seconds the building must wait before spawning its FIRST unit.
   * Can be equal to or different from spawnIntervalSec.
   */
  initialSpawnCooldownSec: number;
  /**
   * Time in seconds between subsequent unit spawns after the first unit has spawned.
   */
  spawnIntervalSec?: number;
  spawnCount?: number;
  unitArchetype?: UnitArchetypeConfig;
  structureAttributes?: FundamentalAttributes;
  spellRadiusTiles?: number;
  spellPower?: number;
  spellEffect?: 'orbital_strike' | 'overcharge_shield';
}

export interface CardProgressState {
  cardId: string;
  level: number;
  duplicates: number;
}

export interface ResourceNodeEntity {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
  materialId: ResourceMaterialId;
  spriteVariant: SpriteVariantId;
  remainingAmount: number;
  maxAmount: number;
}

export type StructureLifecycleState = 'constructing' | 'active';

export interface StructureEntity {
  id: string;
  owner: 'player' | 'enemy';
  factionId: FactionId;
  cardId: string;
  functionalRole?: FunctionalRoleId;
  name: string;
  isCitadel: boolean;
  isDefenseTower: boolean;
  anchorCol: number;
  anchorRow: number;
  footprintOffsets: TileOffset[];
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  level: number;
  attributes: FundamentalAttributes;
  lifecycleState: StructureLifecycleState;
  buildDurationSec: number;
  buildProgressSec: number;
  initialSpawnCooldownSec: number;
  spawnIntervalSec: number;
  spawnTimerSec: number;
  hasCompletedInitialCooldown: boolean;
  unitArchetype?: UnitArchetypeConfig;
  attackCooldownSec: number;
  buffTimerSec: number;
}

export interface UnitEntity {
  id: string;
  owner: 'player' | 'enemy';
  factionId: FactionId;
  name: string;
  role: UnitRole;
  traversableDomains: TraversalDomain[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  level: number;
  isRanged: boolean;
  baseAttributes: FundamentalAttributes;
  effectiveAttributes: FundamentalAttributes;
  carryingAmount: number;
  carryingMaterialId: ResourceMaterialId | null;
  targetNodeId: string | null;
  attackCooldownSec: number;
  buffTimerSec: number;
  animPhase: number;
  pathWaypoints?: TileCoord[];
  pathTargetKey?: string;
}

export interface ProjectileEntity {
  id: string;
  owner: 'player' | 'enemy';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  color: string;
  splashRadius: number;
}

export interface SpellEffectEntity {
  id: string;
  owner: 'player' | 'enemy';
  type: 'orbital_strike' | 'overcharge_shield';
  x: number;
  y: number;
  radius: number;
  remainingSec: number;
  maxDurationSec: number;
}

export interface DerivedUnitStats {
  moveSpeedPxPerSec: number;
  maxHp: number;
  attackDamage: number;
  attackIntervalSec: number;
  attackRangePx: number;
  carryCapacity: number;
  knockbackResistance: number;
}

export interface RivalCommanderProfile {
  id: string;
  name: string;
  title: string;
  factionId: FactionId;
  biomeId: MapBiomeId;
  trophyReward: number;
  chestDropName: string;
}

export interface BattleTelemetrySnapshot {
  playerEssence: number;
  enemyEssence: number;
  playerCitadelHp: number;
  playerCitadelMaxHp: number;
  enemyCitadelHp: number;
  enemyCitadelMaxHp: number;
  playerUnitCount: number;
  enemyUnitCount: number;
  playerHarvesterCount: number;
  playerStructureCount: number;
  enemyStructureCount: number;
  dominationRatio: number; // 0..100 player domination percentage
  remainingMatchSec: number;
  elapsedSec: number;
  status: 'playing' | 'victory' | 'defeat';
}
