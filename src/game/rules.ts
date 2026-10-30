/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CardDefinition,
  DerivedUnitStats,
  FactionConfig,
  FactionId,
  FootprintShapeId,
  FundamentalAttributes,
  MapBiomeConfig,
  MapBiomeId,
  ResourceMaterialConfig,
  ResourceMaterialId,
  ResourceNodeEntity,
  RivalCommanderProfile,
  StructureEntity,
  TerrainType,
  TileCell,
  TileCoord,
  TileOffset,
  TraversalDomain,
  UnitRole,
} from './types';

// ============================================================================
// 0. CONSTANTS & TILEMAP GEOMETRY (24x32)
// ============================================================================

export const GRID_COLS = 24;
export const GRID_ROWS = 32;

export const MAX_ESSENCE_CAP = 15;
export const INITIAL_STARTING_ESSENCE = 6;
export const BASE_PASSIVE_ESSENCE_PER_SEC = 0.45;
export const MATCH_DURATION_SEC = 240;

export const FOOTPRINT_SHAPES: Record<FootprintShapeId, TileOffset[]> = {
  single_1x1: [{ dc: 0, dr: 0 }],
  bar_2x1: [
    { dc: 0, dr: 0 },
    { dc: 1, dr: 0 },
  ],
  square_2x2: [
    { dc: 0, dr: 0 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 1, dr: 1 },
  ],
  tetromino_L: [
    { dc: 0, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: 2 },
    { dc: 1, dr: 2 },
  ],
  tetromino_T: [
    { dc: 0, dr: 0 },
    { dc: 1, dr: 0 },
    { dc: 2, dr: 0 },
    { dc: 1, dr: 1 },
  ],
  tetromino_Z: [
    { dc: 0, dr: 0 },
    { dc: 1, dr: 0 },
    { dc: 1, dr: 1 },
    { dc: 2, dr: 1 },
  ],
};

// ============================================================================
// 1. PURE FUNDAMENTAL ATTRIBUTE DERIVATION (NO HARDCODED SPEEDS)
// ============================================================================

export function computeEffectiveAttributes(
  base: FundamentalAttributes,
  factionMultipliers: FundamentalAttributes,
  level: number = 1,
  carriedLoadMass: number = 0
): FundamentalAttributes {
  const safeLevel = Math.max(1, level);
  const levelScale = 1 + (safeLevel - 1) * 0.08;

  return {
    strength: Number((base.strength * factionMultipliers.strength * levelScale).toFixed(2)),
    agility: Number((base.agility * factionMultipliers.agility * levelScale).toFixed(2)),
    mass: Number((base.mass * factionMultipliers.mass + Math.max(0, carriedLoadMass)).toFixed(2)),
    intelligence: Number((base.intelligence * factionMultipliers.intelligence * levelScale).toFixed(2)),
  };
}

/**
 * Derives movement speed from Agility, Strength, and Mass.
 * Scaled so the battlefield feels like hundreds of meters (~0.5 to 1.2 tiles/sec),
 * giving the player ample strategic time to plan and counter.
 */
export function deriveMovementSpeed(attrs: FundamentalAttributes): number {
  const impulse = attrs.agility * 3.8 + attrs.strength * 0.85;
  const inertia = Math.pow(Math.max(2, attrs.mass), 0.38);
  const rawSpeed = (impulse / inertia) * 0.72;
  return Math.max(7, Math.min(34, Number(rawSpeed.toFixed(2))));
}

export function deriveExtractionRate(
  attrs: FundamentalAttributes,
  material: ResourceMaterialConfig
): number {
  const physicalPower = (attrs.strength * 1.15 + attrs.agility * 0.65) / Math.max(0.4, material.hardness);
  const arcaneControl =
    material.arcaneComplexity > 0.2
      ? (attrs.intelligence * 1.45) / (material.arcaneComplexity + 0.5)
      : 1 + attrs.intelligence * 0.025;

  const cadenceFactor = 0.7 + attrs.agility * 0.03;
  const rawRate = physicalPower * arcaneControl * cadenceFactor * 0.26;
  return Math.max(0.25, Number(rawRate.toFixed(2)));
}

/**
 * Derives combat and utility stats from the 4 fundamental attributes.
 * Ranged attack range is restricted to just a few tiles (~2.2 to 3.4 tiles),
 * while melee range is ~0.75 to 1.05 tiles.
 */
export function deriveUnitStats(
  attrs: FundamentalAttributes,
  role: UnitRole,
  isRanged: boolean,
  tileSize: number = 18
): DerivedUnitStats {
  const moveSpeedPxPerSec = deriveMovementSpeed(attrs);
  const maxHp = Math.round(attrs.mass * 12.5 + attrs.strength * 5.2);

  const rawDamage = isRanged
    ? attrs.intelligence * 1.65 + attrs.agility * 0.85 + attrs.strength * 0.4
    : role === 'siege'
    ? attrs.strength * 2.25 + attrs.mass * 0.85
    : attrs.strength * 1.6 + attrs.agility * 0.55;

  const attackDamage = Math.max(4, Math.round(rawDamage));

  const rawInterval = (16 + attrs.mass * 0.38) / (10 + attrs.agility * 1.18);
  const attackIntervalSec = Number(Math.max(0.45, Math.min(2.6, rawInterval)).toFixed(2));

  // Ranged units reach ~2.2 to 3.4 tiles; Melee units reach ~0.75 to 1.05 tiles
  const rangeInTiles = isRanged
    ? Math.min(3.5, 1.75 + attrs.intelligence * 0.055 + attrs.strength * 0.012)
    : 0.68 + Math.sqrt(attrs.mass) * 0.05;

  const attackRangePx = Math.round(tileSize * rangeInTiles);

  const carryCapacity = Math.max(
    4,
    Math.round(attrs.strength * 0.95 + attrs.mass * 0.35 + attrs.intelligence * 0.25)
  );

  const knockbackResistance = Number(Math.min(0.9, attrs.mass / (attrs.mass + 16)).toFixed(2));

  return {
    moveSpeedPxPerSec,
    maxHp,
    attackDamage,
    attackIntervalSec,
    attackRangePx,
    carryCapacity,
    knockbackResistance,
  };
}

// ============================================================================
// 2. TILEMAP 24x32, ORDERED TRAVERSAL DOMAINS & POLYOMINO PLACEMENT RULES
// ============================================================================

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function isValidTileCoord(col: number, row: number): boolean {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

export function getFootprintTiles(
  anchorCol: number,
  anchorRow: number,
  offsets: TileOffset[]
): TileCoord[] {
  return offsets.map((off) => ({
    col: anchorCol + off.dc,
    row: anchorRow + off.dr,
  }));
}

/**
 * Generates the 24x32 tilemap for the battlefield.
 * Features outer void_water ('water'), cliff_rock ridges ('cliff'), and ground_plain/mineral_ground ('ground').
 */
export function generateTilemapGrid(_biomeId: MapBiomeId = 'map_korhal_basin'): TileCell[][] {
  const grid: TileCell[][] = [];

  for (let row = 0; row < GRID_ROWS; row++) {
    const rowCells: TileCell[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      const nx = (col + 0.5 - GRID_COLS / 2) / (GRID_COLS / 2);
      const ny = (row + 0.5 - GRID_ROWS / 2) / (GRID_ROWS / 2);

      const dist = Math.hypot(nx * 1.04, ny * 0.96);
      let terrain: TerrainType = 'ground_plain';
      let domain: Exclude<TraversalDomain, 'air'> = 'ground';
      let walkable = true;
      let buildable = true;
      let elevation = 1;

      if (col <= 1 || col >= GRID_COLS - 2 || row <= 1 || row >= GRID_ROWS - 2 || dist > 0.94) {
        terrain = 'void_water';
        domain = 'water';
        walkable = false;
        buildable = false;
        elevation = 0;
      } else if (
        // Tactical central ridge / canyon cliffs leaving 3 clear lanes (West, Center, East)
        (row >= 14 && row <= 17 && (col === 7 || col === 8 || col === 15 || col === 16)) ||
        // Symmetric rocky outcrops protecting flank approaches
        (row === 9 && (col === 4 || col === 19)) ||
        (row === 22 && (col === 4 || col === 19))
      ) {
        terrain = 'cliff_rock';
        domain = 'cliff';
        walkable = false;
        buildable = false;
        elevation = 2;
      } else if (
        // Mineral-rich basins near bases and expansions
        (row >= 3 && row <= 7 && col >= 4 && col <= 9) ||
        (row >= 24 && row <= 28 && col >= 14 && col <= 19) ||
        (row >= 13 && row <= 18 && col >= 10 && col <= 13)
      ) {
        terrain = 'mineral_ground';
        domain = 'ground';
        walkable = true;
        buildable = true;
        elevation = 1;
      }

      rowCells.push({
        col,
        row,
        terrain,
        domain,
        walkable,
        buildable,
        elevation,
      });
    }
    grid.push(rowCells);
  }

  return grid;
}

/**
 * Computes the traversal step weight for a tile given a unit's ordered `traversableDomains` list.
 * - Order matters: index 0 (most preferred) has weight 1.0, index 1 has weight 2.25, index 2 has weight 3.5, etc.
 * - If the tile's domain is not in `traversableDomains` (and `'air'` is not present), returns `null` (impassable).
 */
export function getTileTraversalCost(
  cell: TileCell | undefined,
  traversableDomains: TraversalDomain[] = ['ground']
): number | null {
  if (!cell || !traversableDomains || traversableDomains.length === 0) return null;

  const domainIndex = traversableDomains.indexOf(cell.domain);
  const airIndex = traversableDomains.indexOf('air');

  let bestIndex = -1;
  if (domainIndex >= 0 && airIndex >= 0) {
    bestIndex = Math.min(domainIndex, airIndex);
  } else if (domainIndex >= 0) {
    bestIndex = domainIndex;
  } else if (airIndex >= 0) {
    bestIndex = airIndex;
  }

  if (bestIndex < 0) return null;

  // Higher index = less preferred = higher pathfinding cost
  return Number((1 + bestIndex * 1.25).toFixed(2));
}

/**
 * Checks if a tile is traversable for a unit's ordered `traversableDomains`.
 */
export function isTileWalkableForUnit(
  grid: TileCell[][],
  col: number,
  row: number,
  traversableDomains: TraversalDomain[] = ['ground']
): boolean {
  if (!isValidTileCoord(col, row)) return false;
  const cell = grid[row]?.[col];
  return getTileTraversalCost(cell, traversableDomains) !== null;
}

/**
 * Layered hook for faction-specific terrain rules.
 * Currently allows building on any buildable tile across the entire map (no territory radius limit),
 * while keeping the extension point ready for future faction terrain mechanics.
 */
export function canFactionBuildOnTile(_factionId: FactionId, cell: TileCell): boolean {
  return cell.buildable;
}

/**
 * Validates whether a structure with arbitrary polyomino offsets (1x1, 2x1, 2x2, L, T, Z, etc.)
 * can be placed at (anchorCol, anchorRow) on the 24x32 grid.
 */
export function canPlaceStructureOnGrid(
  grid: TileCell[][],
  anchorCol: number,
  anchorRow: number,
  offsets: TileOffset[],
  existingStructures: Array<Pick<StructureEntity, 'anchorCol' | 'anchorRow' | 'footprintOffsets' | 'hp'>>,
  resourceNodes: Array<Pick<ResourceNodeEntity, 'col' | 'row' | 'remainingAmount'>>,
  factionId: FactionId
): boolean {
  if (!offsets || offsets.length === 0) return false;

  const occupiedSet = new Set<string>();
  for (const st of existingStructures) {
    if (st.hp <= 0) continue;
    for (const tile of getFootprintTiles(st.anchorCol, st.anchorRow, st.footprintOffsets)) {
      occupiedSet.add(tileKey(tile.col, tile.row));
    }
  }
  for (const node of resourceNodes) {
    if (node.remainingAmount <= 0) continue;
    occupiedSet.add(tileKey(node.col, node.row));
  }

  const targetTiles = getFootprintTiles(anchorCol, anchorRow, offsets);
  for (const tile of targetTiles) {
    if (!isValidTileCoord(tile.col, tile.row)) return false;
    const cell = grid[tile.row]?.[tile.col];
    if (!cell || !canFactionBuildOnTile(factionId, cell)) return false;
    if (occupiedSet.has(tileKey(tile.col, tile.row))) return false;
  }

  return true;
}

/**
 * Weighted A* grid pathfinding over the 24x32 tilemap.
 * Respects `traversableDomains` order by applying `getTileTraversalCost(cell, traversableDomains)`
 * so units always prefer domains earlier in their list and only use secondary domains when beneficial or required.
 */
export function findWalkablePathOnGrid(
  grid: TileCell[][],
  start: TileCoord,
  goal: TileCoord,
  blockedTiles: Set<string>,
  traversableDomains: TraversalDomain[] = ['ground']
): TileCoord[] {
  const clampedStart: TileCoord = {
    col: Math.max(0, Math.min(GRID_COLS - 1, start.col)),
    row: Math.max(0, Math.min(GRID_ROWS - 1, start.row)),
  };
  const clampedGoal: TileCoord = {
    col: Math.max(0, Math.min(GRID_COLS - 1, goal.col)),
    row: Math.max(0, Math.min(GRID_ROWS - 1, goal.row)),
  };

  if (clampedStart.col === clampedGoal.col && clampedStart.row === clampedGoal.row) {
    return [clampedGoal];
  }

  const startKey = tileKey(clampedStart.col, clampedStart.row);
  const goalKey = tileKey(clampedGoal.col, clampedGoal.row);

  const openList: Array<{ coord: TileCoord; fScore: number }> = [
    {
      coord: clampedStart,
      fScore: Math.hypot(clampedGoal.col - clampedStart.col, clampedGoal.row - clampedStart.row),
    },
  ];
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, TileCoord | null>();
  const gScore = new Map<string, number>();

  cameFrom.set(startKey, null);
  gScore.set(startKey, 0);

  let closestTile = clampedStart;
  let closestDist = Math.hypot(clampedGoal.col - clampedStart.col, clampedGoal.row - clampedStart.row);

  const dirs: TileOffset[] = [
    { dc: 0, dr: -1 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: -1 },
    { dc: 1, dr: 1 },
    { dc: -1, dr: 1 },
    { dc: -1, dr: -1 },
  ];

  let steps = 0;
  const maxSteps = GRID_COLS * GRID_ROWS * 2;
  const isAirCapable = traversableDomains.includes('air');

  while (openList.length > 0 && steps < maxSteps) {
    steps++;
    // Pop node with lowest fScore
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].fScore < openList[bestIdx].fScore) {
        bestIdx = i;
      }
    }
    const current = openList.splice(bestIdx, 1)[0].coord;
    const currentKey = tileKey(current.col, current.row);

    if (closedSet.has(currentKey)) continue;
    closedSet.add(currentKey);

    if (currentKey === goalKey) {
      closestTile = current;
      break;
    }

    const d = Math.hypot(clampedGoal.col - current.col, clampedGoal.row - current.row);
    if (d < closestDist) {
      closestDist = d;
      closestTile = current;
    }

    const currentG = gScore.get(currentKey) ?? 0;

    for (const dir of dirs) {
      const nc = current.col + dir.dc;
      const nr = current.row + dir.dr;
      if (!isValidTileCoord(nc, nr)) continue;

      const nKey = tileKey(nc, nr);
      if (closedSet.has(nKey)) continue;

      const neighborCell = grid[nr]?.[nc];
      const domainCost = getTileTraversalCost(neighborCell, traversableDomains);
      if (domainCost === null) continue;

      const isGoal = nKey === goalKey;
      if (!isGoal && !isAirCapable && blockedTiles.has(nKey)) {
        continue;
      }

      // Prevent diagonal corner-cutting across impassable cells
      if (dir.dc !== 0 && dir.dr !== 0 && !isAirCapable) {
        if (
          !isTileWalkableForUnit(grid, current.col + dir.dc, current.row, traversableDomains) ||
          !isTileWalkableForUnit(grid, current.col, current.row + dir.dr, traversableDomains)
        ) {
          continue;
        }
      }

      const stepDistance = dir.dc !== 0 && dir.dr !== 0 ? Math.SQRT2 : 1;
      const tentativeG = currentG + stepDistance * domainCost;

      const prevG = gScore.get(nKey);
      if (prevG === undefined || tentativeG < prevG) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        const heuristic = Math.hypot(clampedGoal.col - nc, clampedGoal.row - nr);
        openList.push({
          coord: { col: nc, row: nr },
          fScore: tentativeG + heuristic,
        });
      }
    }
  }

  const path: TileCoord[] = [];
  let cursor: TileCoord | null = closestTile;
  while (cursor) {
    path.push(cursor);
    const k = tileKey(cursor.col, cursor.row);
    if (k === startKey) break;
    cursor = cameFrom.get(k) ?? null;
  }
  path.reverse();

  if (path.length > 1) {
    return path.slice(1);
  }
  return path;
}

// ============================================================================
// 3. STRUCTURE CONSTRUCTION & INITIAL SPAWN COOLDOWN LIFECYCLE
// ============================================================================

export interface StructureLifecycleStepResult {
  shouldSpawnUnit: boolean;
  canAttack: boolean;
  constructionProgressRatio: number;
  productionProgressRatio: number;
}

/**
 * Pure state machine step for structure construction and unit production:
 * 1. While `lifecycleState === 'constructing'`, advances `buildProgressSec` toward `buildDurationSec`.
 *    No units spawn and the structure cannot attack.
 * 2. Once `buildProgressSec >= buildDurationSec`, transitions to `lifecycleState = 'active'`
 *    with `spawnTimerSec = 0` and `hasCompletedInitialCooldown = false`.
 * 3. While `active`, the structure MUST wait `initialSpawnCooldownSec` before spawning its FIRST unit.
 * 4. Subsequent units spawn every `spawnIntervalSec`.
 */
export function advanceStructureLifecycle(
  st: Pick<
    StructureEntity,
    | 'lifecycleState'
    | 'buildDurationSec'
    | 'buildProgressSec'
    | 'initialSpawnCooldownSec'
    | 'spawnIntervalSec'
    | 'spawnTimerSec'
    | 'hasCompletedInitialCooldown'
    | 'unitArchetype'
  >,
  dt: number
): StructureLifecycleStepResult {
  if (st.lifecycleState === 'constructing') {
    const remainingBuild = Math.max(0, st.buildDurationSec - st.buildProgressSec);
    if (dt < remainingBuild) {
      st.buildProgressSec += dt;
      return {
        shouldSpawnUnit: false,
        canAttack: false,
        constructionProgressRatio:
          st.buildDurationSec > 0 ? Math.min(1, st.buildProgressSec / st.buildDurationSec) : 1,
        productionProgressRatio: 0,
      };
    }
    st.buildProgressSec = st.buildDurationSec;
    st.lifecycleState = 'active';
    st.spawnTimerSec = 0;
    st.hasCompletedInitialCooldown = false;
    dt = Math.max(0, dt - remainingBuild);
  }

  if (!st.unitArchetype) {
    return {
      shouldSpawnUnit: false,
      canAttack: true,
      constructionProgressRatio: 1,
      productionProgressRatio: 0,
    };
  }

  const requiredCooldown = st.hasCompletedInitialCooldown
    ? Math.max(0.5, st.spawnIntervalSec)
    : Math.max(0.5, st.initialSpawnCooldownSec);

  st.spawnTimerSec += dt;
  let shouldSpawnUnit = false;

  if (st.spawnTimerSec >= requiredCooldown) {
    st.spawnTimerSec -= requiredCooldown;
    st.hasCompletedInitialCooldown = true;
    shouldSpawnUnit = true;
  }

  const nextRequired = st.hasCompletedInitialCooldown
    ? Math.max(0.5, st.spawnIntervalSec)
    : Math.max(0.5, st.initialSpawnCooldownSec);

  return {
    shouldSpawnUnit,
    canAttack: true,
    constructionProgressRatio: 1,
    productionProgressRatio: Math.min(1, st.spawnTimerSec / nextRequired),
  };
}

// ============================================================================
// 4. PROGRESSION & OUTCOME RULES
// ============================================================================

export function calculateCardUpgradeRequirements(currentLevel: number): {
  duplicatesRequired: number;
  essenceShardCost: number;
} {
  const safeLevel = Math.max(1, currentLevel);
  return {
    duplicatesRequired: safeLevel * 2 + (safeLevel - 1) * 2,
    essenceShardCost: safeLevel * 50,
  };
}

export function checkSkirmishOutcome(
  playerCitadelHp: number,
  enemyCitadelHp: number
): 'playing' | 'victory' | 'defeat' {
  if (playerCitadelHp <= 0) return 'defeat';
  if (enemyCitadelHp <= 0) return 'victory';
  return 'playing';
}

// ============================================================================
// 5. LAYERED FACTIONS CATALOG: GONN, MARTIANS, QENTAURI (STARCRAFT VIBE)
// ============================================================================

export const FACTIONS: Record<FactionId, FactionConfig> = {
  gonn: {
    id: 'gonn',
    name: 'Enjambre Gonn',
    inspirationTag: 'Bio-Swarm (Zerg-like)',
    tagline: 'Evolución mutagénica, velocidad depredadora y proliferación implacable.',
    lore: 'Organismos superadaptativos que metabolizan minerales y flora en Biomasa Mutagénica. Sus criaturas son más ligeras y veloces que cualquier ejército convencional.',
    essentialResourceName: 'Biomasa Mutagénica',
    essentialResourceUnit: 'Bio',
    primaryColor: '#a3e635',
    secondaryColor: '#3f6212',
    accentColor: '#c084fc',
    avatarUrl: '/assets/art/faction_gonn.png',
    architectureStyle: 'bio_chitin',
    attributeMultipliers: {
      strength: 1.04,
      agility: 1.24,
      mass: 0.82,
      intelligence: 0.96,
    },
    roleSkins: {
      role_harvester_camp: {
        name: 'Criadero de Zánganos',
        unitName: 'Zángano Gonn',
        description: 'Incuba recolectores orgánicos de alta agilidad metabólica.',
        visualStyle: 'gonn_hive',
      },
      role_melee_spawner: {
        name: 'Fosa de Despedazadores',
        unitName: 'Despedazador Gonn',
        description: 'Engendra depredadores cuerpo a cuerpo con garras quitinosas.',
        visualStyle: 'gonn_hive',
      },
      role_ranged_spawner: {
        name: 'Guarida de Escupidores',
        unitName: 'Escupidor Ácido',
        description: 'Produce cepas artilleras que lanzan espinas y ácido corrosivo.',
        visualStyle: 'gonn_hive',
      },
      role_heavy_spawner: {
        name: 'Caverna de Behemoths',
        unitName: 'Behemoth Quimérico',
        description: 'Gesta colosos blindados de asedio capaces de demoler ciudadelas.',
        visualStyle: 'gonn_hive',
      },
      role_defense_turret: {
        name: 'Espina Simbiótica',
        description: 'Tentáculo defensivo enraizado que perfora amenazas cercanas.',
        visualStyle: 'gonn_hive',
      },
      role_vanguard_drop: {
        name: 'Eclosión de Enjambre',
        unitName: 'Despedazador Gonn',
        description: 'Eclosiona instantáneamente una manada de asalto en la casilla elegida.',
        visualStyle: 'gonn_hive',
      },
      role_orbital_strike: {
        name: 'Lluvia de Esporas Ácidas',
        description: 'Bombardeo biológico que corroe estructuras y tropas en el área.',
        visualStyle: 'gonn_hive',
      },
      role_overcharge_shield: {
        name: 'Frenesí Adrenal',
        description: 'Regenera tejido vivo y acelera la cadencia de ataque y movimiento.',
        visualStyle: 'gonn_hive',
      },
    },
  },
  martians: {
    id: 'martians',
    name: 'Dominio Martians',
    inspirationTag: 'Terran-Industrial (Terran-like)',
    tagline: 'Ingeniería balística, blindaje modular de titanio y doctrina táctica.',
    lore: 'Colonos industriales de las bóvedas marcianas que refinan todo recurso en Aleación Marciana. Despliegan búnkeres modulares, infantería blindada y mechas de asedio.',
    essentialResourceName: 'Aleación Marciana',
    essentialResourceUnit: 'Aleación',
    primaryColor: '#38bdf8',
    secondaryColor: '#0369a1',
    accentColor: '#f59e0b',
    avatarUrl: '/assets/art/faction_martians.png',
    architectureStyle: 'terran_steel',
    attributeMultipliers: {
      strength: 1.12,
      agility: 1.02,
      mass: 1.12,
      intelligence: 1.0,
    },
    roleSkins: {
      role_harvester_camp: {
        name: 'Refinería de VCEs',
        unitName: 'VCE Marciano',
        description: 'Ensambla vehículos de construcción y extracción con cortadoras térmicas.',
        visualStyle: 'martian_bunker',
      },
      role_melee_spawner: {
        name: 'Barracón de Asalto',
        unitName: 'Demoledor Táctico',
        description: 'Entrena infantería pesada de choque con exo-armadura.',
        visualStyle: 'martian_bunker',
      },
      role_ranged_spawner: {
        name: 'Academia de Fusileros Gauss',
        unitName: 'Marine Gauss',
        description: 'Despliega escuadrones con rifles electromagnéticos de largo alcance.',
        visualStyle: 'martian_bunker',
      },
      role_heavy_spawner: {
        name: 'Fábrica de Goliats',
        unitName: 'Goliat de Asedio',
        description: 'Construye caminantes blindados pesados para romper líneas defensivas.',
        visualStyle: 'martian_bunker',
      },
      role_defense_turret: {
        name: 'Búnker Automático',
        description: 'Torreta artillada de acero marciano con cañones rotativos.',
        visualStyle: 'martian_bunker',
      },
      role_vanguard_drop: {
        name: 'Cápsula Orbital de Choque',
        unitName: 'Demoledor Táctico',
        description: 'Despliega una escuadra de choque mediante cápsulas de descenso.',
        visualStyle: 'martian_bunker',
      },
      role_orbital_strike: {
        name: 'Bombardeo Táctico Yamato',
        description: 'Descarga orbital de plasma sobre las coordenadas designadas.',
        visualStyle: 'martian_bunker',
      },
      role_overcharge_shield: {
        name: 'Inyección Stim-Nano',
        description: 'Repara blindaje y sobrecarga los servos de combate aliados.',
        visualStyle: 'martian_bunker',
      },
    },
  },
  qentauri: {
    id: 'qentauri',
    name: 'Cónclave Qentauri',
    inspirationTag: 'Psionic Ascendancy (Protoss-like)',
    tagline: 'Tecnología de transposición cristalina, escudos de éter y supremacía arcana.',
    lore: 'Civilización ancestral que canaliza cualquier veta mineral o cristalina en Éter Psiónico. Sus unidades son menos numerosas pero poseen una potencia e inteligencia superiores.',
    essentialResourceName: 'Éter Psiónico',
    essentialResourceUnit: 'Éter',
    primaryColor: '#22d3ee',
    secondaryColor: '#0e7490',
    accentColor: '#fbbf24',
    avatarUrl: '/assets/art/faction_qentauri.png',
    architectureStyle: 'psionic_crystal',
    attributeMultipliers: {
      strength: 1.16,
      agility: 0.96,
      mass: 1.16,
      intelligence: 1.28,
    },
    roleSkins: {
      role_harvester_camp: {
        name: 'Nexo de Sondas',
        unitName: 'Sonda Qentauri',
        description: 'Transposiciona sondas levitantes de alta eficiencia psiónica.',
        visualStyle: 'qentauri_pylon',
      },
      role_melee_spawner: {
        name: 'Portal de Zelotes',
        unitName: 'Templario Qentauri',
        description: 'Invoca guerreros con hojas psiónicas y armadura dorada.',
        visualStyle: 'qentauri_pylon',
      },
      role_ranged_spawner: {
        name: 'Núcleo Cibernético',
        unitName: 'Acechador de Fase',
        description: 'Materializa tiradores cuánticos que disparan haces de antimateria.',
        visualStyle: 'qentauri_pylon',
      },
      role_heavy_spawner: {
        name: 'Bahía de Colosos',
        unitName: 'Arconte Colosal',
        description: 'Invoca constructos supremos de asedio con lanzas térmicas.',
        visualStyle: 'qentauri_pylon',
      },
      role_defense_turret: {
        name: 'Cañón de Fotones',
        description: 'Pilar cristalino que condensa esferas de energía antimateria.',
        visualStyle: 'qentauri_pylon',
      },
      role_vanguard_drop: {
        name: 'Transposición de Guardia',
        unitName: 'Templario Qentauri',
        description: 'Teletransporta guerreros directamente al frente de batalla.',
        visualStyle: 'qentauri_pylon',
      },
      role_orbital_strike: {
        name: 'Tormenta Psiónica',
        description: 'Desgarra la realidad con descargas de energía psiónica pura.',
        visualStyle: 'qentauri_pylon',
      },
      role_overcharge_shield: {
        name: 'Armonía de Escudos',
        description: 'Restaura la matriz de integridad y potencia a las fuerzas aliadas.',
        visualStyle: 'qentauri_pylon',
      },
    },
  },
};

export function resolveCardForFaction(card: CardDefinition, factionId: FactionId): CardDefinition {
  const faction = FACTIONS[factionId];
  const skin = faction.roleSkins[card.functionalRole];
  if (!skin) return card;

  return {
    ...card,
    name: skin.name,
    description: skin.description,
    unitArchetype: card.unitArchetype
      ? {
          ...card.unitArchetype,
          name: skin.unitName ?? card.unitArchetype.name,
        }
      : undefined,
  };
}

// ============================================================================
// 6. SCALABLE RESOURCES & MULTI-SPRITE BIOMES (1x1 RESOURCE NODES)
// ============================================================================

export const RESOURCE_MATERIALS: Record<ResourceMaterialId, ResourceMaterialConfig> = {
  res_unified_flux: {
    id: 'res_unified_flux',
    name: 'Veta Primordial Mixta',
    description:
      'Recurso unificado inicial: comparte los mismos atributos físicos pero se manifiesta con sprites de Flora, Cristal o Mineral (1x1 casilla).',
    hardness: 1.2,
    arcaneComplexity: 1.0,
    baseEssenceYield: 1.0,
    unitMassPerLoad: 0.4,
    spriteVariants: ['sprite_bio_tree', 'sprite_psionic_crystal', 'sprite_ferric_ore'],
  },
  res_vespene_flora: {
    id: 'res_vespene_flora',
    name: 'Biomasa de Flora',
    description: 'Fibra orgánica blanda y rápida de cortar mediante Fuerza y Agilidad.',
    hardness: 0.95,
    arcaneComplexity: 0.5,
    baseEssenceYield: 0.9,
    unitMassPerLoad: 0.35,
    spriteVariants: ['sprite_bio_tree', 'sprite_spore_geyser'],
  },
  res_khaydarin_crystal: {
    id: 'res_khaydarin_crystal',
    name: 'Cristal Khaydarin',
    description:
      'Cristal de alta dureza (2.7) y alta complejidad psiónica (2.5): premia a razas con alta Inteligencia y Fuerza.',
    hardness: 2.7,
    arcaneComplexity: 2.5,
    baseEssenceYield: 1.85,
    unitMassPerLoad: 0.65,
    spriteVariants: ['sprite_psionic_crystal'],
  },
  res_martian_ore: {
    id: 'res_martian_ore',
    name: 'Mineral Férrico Denso',
    description: 'Veta metálica muy dura (3.2) y pesada de transportar, con baja complejidad arcana.',
    hardness: 3.2,
    arcaneComplexity: 0.6,
    baseEssenceYield: 1.65,
    unitMassPerLoad: 0.9,
    spriteVariants: ['sprite_ferric_ore'],
  },
};

export const MAP_BIOMES: Record<MapBiomeId, MapBiomeConfig> = {
  map_korhal_basin: {
    id: 'map_korhal_basin',
    name: 'Cuenca de Armonía (Multi-Sprite 1x1)',
    subtitle: 'Un solo recurso funcional con sprites variados (Árboles, Cristales y Minerales)',
    description:
      'Todos los nodos 1x1 usan la Veta Primordial Mixta pero alternan sprites de flora, cristal y mineral para demostrar separación cosmética.',
    waterColor: '#0f2942',
    groundColor: '#3f7d3b',
    groundAccentColor: '#4f9149',
    cliffColor: '#334155',
    mineralGroundColor: '#2f684e',
    resourceRules: [
      { materialId: 'res_unified_flux', weight: 0.4, forcedSprite: 'sprite_bio_tree' },
      { materialId: 'res_unified_flux', weight: 0.35, forcedSprite: 'sprite_psionic_crystal' },
      { materialId: 'res_unified_flux', weight: 0.25, forcedSprite: 'sprite_ferric_ore' },
    ],
  },
  map_aiur_sanctuary: {
    id: 'map_aiur_sanctuary',
    name: 'Santuario Khaydarin (Física Separada)',
    subtitle: 'Sprites de Cristal transferidos a material con Dureza 2.7 y Complejidad 2.5',
    description:
      'Separa los cristales en un segundo recurso real con dureza y complejidad psiónica superiores, haciendo que Qentauri y Martians destaquen de forma distinta.',
    waterColor: '#0c1f38',
    groundColor: '#2f6a56',
    groundAccentColor: '#3b8068',
    cliffColor: '#312e81',
    mineralGroundColor: '#1e4e5f',
    resourceRules: [
      { materialId: 'res_vespene_flora', weight: 0.5, forcedSprite: 'sprite_bio_tree' },
      { materialId: 'res_khaydarin_crystal', weight: 0.5, forcedSprite: 'sprite_psionic_crystal' },
    ],
  },
  map_char_caldera: {
    id: 'map_char_caldera',
    name: 'Caldera Férrica (Triple Material)',
    subtitle: 'Mineral Férrico (Dureza 3.2) + Cristal Khaydarin + Biomasa',
    description:
      'Terreno volcánico-industrial donde coexisten los tres materiales con propiedades físicas diferenciadas.',
    waterColor: '#1e1b2e',
    groundColor: '#475569',
    groundAccentColor: '#526277',
    cliffColor: '#1e293b',
    mineralGroundColor: '#3b4254',
    resourceRules: [
      { materialId: 'res_martian_ore', weight: 0.45, forcedSprite: 'sprite_ferric_ore' },
      { materialId: 'res_khaydarin_crystal', weight: 0.3, forcedSprite: 'sprite_psionic_crystal' },
      { materialId: 'res_vespene_flora', weight: 0.25, forcedSprite: 'sprite_spore_geyser' },
    ],
  },
};

// ============================================================================
// 7. BASE FUNCTIONAL CARDS CATALOG (WITH BUILD DURATION & INITIAL COOLDOWN)
// ============================================================================

export const CARDS_CATALOG: CardDefinition[] = [
  {
    id: 'card_peon_lodge',
    functionalRole: 'role_harvester_camp',
    name: 'Centro de Recolección',
    category: 'spawner',
    cost: 4,
    artworkUrl: '/assets/art/card_peon_lodge.png',
    description: 'Estructura 2x1. Tras construirse y completar su cooldown inicial, genera recolectores.',
    footprintShape: 'bar_2x1',
    footprintOffsets: FOOTPRINT_SHAPES.bar_2x1,
    buildDurationSec: 4.0,
    initialSpawnCooldownSec: 3.5,
    spawnIntervalSec: 11.0,
    unitArchetype: {
      id: 'unit_peon',
      name: 'Recolector',
      role: 'harvester',
      traversableDomains: ['ground'],
      isRanged: false,
      visualScale: 0.9,
      baseAttributes: {
        strength: 11,
        agility: 14,
        mass: 8,
        intelligence: 11,
      },
    },
    structureAttributes: {
      strength: 8,
      agility: 6,
      mass: 36,
      intelligence: 10,
    },
  },
  {
    id: 'card_vanguard_barracks',
    functionalRole: 'role_melee_spawner',
    name: 'Barracón de Choque',
    category: 'spawner',
    cost: 5,
    artworkUrl: '/assets/art/card_vanguard_barracks.png',
    description: 'Estructura 2x2. Entrena infantería cuerpo a cuerpo tras su tiempo de construcción.',
    footprintShape: 'square_2x2',
    footprintOffsets: FOOTPRINT_SHAPES.square_2x2,
    buildDurationSec: 5.0,
    initialSpawnCooldownSec: 4.0,
    spawnIntervalSec: 7.5,
    unitArchetype: {
      id: 'unit_guardian',
      name: 'Guerrero de Choque',
      role: 'melee',
      traversableDomains: ['ground'],
      isRanged: false,
      visualScale: 1.05,
      baseAttributes: {
        strength: 16,
        agility: 14,
        mass: 14,
        intelligence: 8,
      },
    },
    structureAttributes: {
      strength: 12,
      agility: 6,
      mass: 46,
      intelligence: 8,
    },
  },
  {
    id: 'card_arcane_sanctum',
    functionalRole: 'role_ranged_spawner',
    name: 'Núcleo de Artillería',
    category: 'spawner',
    cost: 6,
    artworkUrl: '/assets/art/card_arcane_sanctum.png',
    description: 'Estructura 2x1. Produce unidades a distancia tras construirse y cargar su núcleo.',
    footprintShape: 'bar_2x1',
    footprintOffsets: FOOTPRINT_SHAPES.bar_2x1,
    buildDurationSec: 5.5,
    initialSpawnCooldownSec: 4.5,
    spawnIntervalSec: 9.0,
    unitArchetype: {
      id: 'unit_weaver',
      name: 'Tirador Táctico',
      role: 'ranged',
      traversableDomains: ['ground'],
      isRanged: true,
      visualScale: 1.0,
      baseAttributes: {
        strength: 10,
        agility: 15,
        mass: 9,
        intelligence: 19,
      },
    },
    structureAttributes: {
      strength: 10,
      agility: 8,
      mass: 38,
      intelligence: 16,
    },
  },
  {
    id: 'card_colossus_foundry',
    functionalRole: 'role_heavy_spawner',
    name: 'Complejo de Asedio',
    category: 'spawner',
    cost: 9,
    artworkUrl: '/assets/art/card_colossus_foundry.png',
    description: 'Estructura pesada 2x2. Requiere construcción e incubación antes de desplegar colosos.',
    footprintShape: 'square_2x2',
    footprintOffsets: FOOTPRINT_SHAPES.square_2x2,
    buildDurationSec: 7.0,
    initialSpawnCooldownSec: 6.0,
    spawnIntervalSec: 15.0,
    unitArchetype: {
      id: 'unit_colossus',
      name: 'Coloso de Asedio',
      role: 'siege',
      traversableDomains: ['ground'],
      isRanged: false,
      visualScale: 1.4,
      baseAttributes: {
        strength: 28,
        agility: 8,
        mass: 34,
        intelligence: 10,
      },
    },
    structureAttributes: {
      strength: 18,
      agility: 5,
      mass: 64,
      intelligence: 12,
    },
  },
  {
    id: 'card_resonance_spire',
    functionalRole: 'role_defense_turret',
    name: 'Torreta Defensiva',
    category: 'defense',
    cost: 5,
    artworkUrl: '/assets/art/card_resonance_spire.png',
    description: 'Estructura 1x1. Se activa al terminar su construcción y dispara a enemigos en rango.',
    footprintShape: 'single_1x1',
    footprintOffsets: FOOTPRINT_SHAPES.single_1x1,
    buildDurationSec: 3.5,
    initialSpawnCooldownSec: 0,
    structureAttributes: {
      strength: 19,
      agility: 15,
      mass: 42,
      intelligence: 21,
    },
  },
  {
    id: 'card_swift_rangers',
    functionalRole: 'role_vanguard_drop',
    name: 'Escuadra de Despliegue',
    category: 'troop',
    cost: 4,
    artworkUrl: '/assets/art/card_swift_rangers.png',
    description: 'Despliega 2 unidades de choque sobre cualquier casilla transitable.',
    footprintShape: 'single_1x1',
    footprintOffsets: FOOTPRINT_SHAPES.single_1x1,
    buildDurationSec: 0,
    initialSpawnCooldownSec: 0,
    spawnCount: 2,
    unitArchetype: {
      id: 'unit_ranger',
      name: 'Incursor Veloz',
      role: 'melee',
      traversableDomains: ['ground'],
      isRanged: false,
      visualScale: 0.95,
      baseAttributes: {
        strength: 13,
        agility: 20,
        mass: 9,
        intelligence: 11,
      },
    },
  },
  {
    id: 'card_spell_solar_barrage',
    functionalRole: 'role_orbital_strike',
    name: 'Descarga Orbital',
    category: 'spell',
    cost: 4,
    artworkUrl: '/assets/art/card_spell_solar_barrage.png',
    description: 'Hechizo táctico que inflige daño directo a enemigos y estructuras en un radio de casillas.',
    footprintShape: 'single_1x1',
    footprintOffsets: FOOTPRINT_SHAPES.single_1x1,
    buildDurationSec: 0,
    initialSpawnCooldownSec: 0,
    spellRadiusTiles: 2.5,
    spellPower: 135,
    spellEffect: 'orbital_strike',
  },
  {
    id: 'card_spell_harmony_aegis',
    functionalRole: 'role_overcharge_shield',
    name: 'Sobrecarga Táctica',
    category: 'spell',
    cost: 4,
    artworkUrl: '/assets/art/card_spell_harmony_aegis.png',
    description: 'Restaura salud e incrementa temporalmente la Agilidad y Fuerza de unidades aliadas.',
    footprintShape: 'single_1x1',
    footprintOffsets: FOOTPRINT_SHAPES.single_1x1,
    buildDurationSec: 0,
    initialSpawnCooldownSec: 0,
    spellRadiusTiles: 3.0,
    spellPower: 95,
    spellEffect: 'overcharge_shield',
  },
];

// ============================================================================
// 8. RIVAL COMMANDERS FOR 1v1 SKIRMISHES
// ============================================================================

export const RIVAL_COMMANDERS: RivalCommanderProfile[] = [
  {
    id: 'rival_kerr_gonn',
    name: 'Reina Xel-Gonn',
    title: 'Progenitora del Enjambre',
    factionId: 'gonn',
    biomeId: 'map_korhal_basin',
    trophyReward: 32,
    chestDropName: 'Cápsula de Biomasa',
  },
  {
    id: 'rival_raynor_martian',
    name: 'Mariscal Vance',
    title: 'Comandante del Dominio',
    factionId: 'martians',
    biomeId: 'map_char_caldera',
    trophyReward: 38,
    chestDropName: 'Cofre de Aleación',
  },
  {
    id: 'rival_artanis_qentauri',
    name: 'Ejecutor Taldarin',
    title: 'Jerarca del Cónclave',
    factionId: 'qentauri',
    biomeId: 'map_aiur_sanctuary',
    trophyReward: 45,
    chestDropName: 'Relicario Psiónico',
  },
];
