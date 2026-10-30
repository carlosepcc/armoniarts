/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTIONS,
  RESOURCE_MATERIALS,
  FOOTPRINT_SHAPES,
  GRID_COLS,
  GRID_ROWS,
  computeEffectiveAttributes,
  deriveMovementSpeed,
  deriveExtractionRate,
  deriveUnitStats,
  generateTilemapGrid,
  getTileTraversalCost,
  isTileWalkableForUnit,
  canPlaceStructureOnGrid,
  findWalkablePathOnGrid,
  advanceStructureLifecycle,
  calculateCardUpgradeRequirements,
  checkSkirmishOutcome,
} from './rules';
import { TileCell } from './types';

test('1. Movement speed is derived purely from Strength, Agility, and Mass (Gonn vs Martians vs Qentauri)', () => {
  const basePeon = { strength: 11, agility: 14, mass: 8, intelligence: 11 };

  const gonnAttrs = computeEffectiveAttributes(basePeon, FACTIONS.gonn.attributeMultipliers, 1, 0);
  const martianAttrs = computeEffectiveAttributes(basePeon, FACTIONS.martians.attributeMultipliers, 1, 0);

  const gonnSpeed = deriveMovementSpeed(gonnAttrs);
  const martianSpeed = deriveMovementSpeed(martianAttrs);

  // Gonn has higher agility (1.24) and lower mass (0.82) than Martians -> moves faster
  assert.ok(
    gonnSpeed > martianSpeed,
    `Expected Gonn peon (${gonnSpeed}) to move faster than Martian peon (${martianSpeed})`
  );

  // Carrying heavy load increases effective mass and reduces movement speed
  const loadedMartianAttrs = computeEffectiveAttributes(basePeon, FACTIONS.martians.attributeMultipliers, 1, 14);
  const loadedMartianSpeed = deriveMovementSpeed(loadedMartianAttrs);
  assert.ok(
    loadedMartianSpeed < martianSpeed,
    `Expected loaded peon (${loadedMartianSpeed}) to move slower than unloaded peon (${martianSpeed})`
  );
});

test('2. Extraction rate responds to material Hardness and Arcane Complexity across StarCraft-like factions', () => {
  const basePeon = { strength: 11, agility: 14, mass: 8, intelligence: 11 };

  const qentauriPeon = computeEffectiveAttributes(basePeon, FACTIONS.qentauri.attributeMultipliers, 1, 0);
  const gonnPeon = computeEffectiveAttributes(basePeon, FACTIONS.gonn.attributeMultipliers, 1, 0);

  const crystal = RESOURCE_MATERIALS.res_khaydarin_crystal; // high hardness (2.7) & high arcaneComplexity (2.5)
  const qentauriCrystalRate = deriveExtractionRate(qentauriPeon, crystal);
  const gonnCrystalRate = deriveExtractionRate(gonnPeon, crystal);

  assert.ok(
    qentauriCrystalRate > gonnCrystalRate,
    `Expected Qentauri (${qentauriCrystalRate}) to extract Khaydarin Crystal faster than Gonn (${gonnCrystalRate})`
  );
});

test('3. Ordered traversableDomains list determines walkability and pathfinding weights', () => {
  const grid = generateTilemapGrid('map_korhal_basin');

  // Cell (0,0) is void_water (domain: 'water'), cell (10,10) is ground_plain (domain: 'ground'), cell (7,15) is cliff_rock (domain: 'cliff')
  const waterCell = grid[0][0];
  const groundCell = grid[10][10];
  const cliffCell = grid[15][7];

  assert.equal(waterCell.domain, 'water');
  assert.equal(groundCell.domain, 'ground');
  assert.equal(cliffCell.domain, 'cliff');

  // Ground-only unit: ['ground']
  assert.equal(getTileTraversalCost(groundCell, ['ground']), 1.0);
  assert.equal(getTileTraversalCost(waterCell, ['ground']), null);
  assert.equal(getTileTraversalCost(cliffCell, ['ground']), null);

  // Amphibious unit preferring ground over water: ['ground', 'water']
  assert.equal(getTileTraversalCost(groundCell, ['ground', 'water']), 1.0);
  assert.equal(getTileTraversalCost(waterCell, ['ground', 'water']), 2.25);
  assert.equal(getTileTraversalCost(cliffCell, ['ground', 'water']), null);

  // Amphibious unit preferring water over ground: ['water', 'ground']
  assert.equal(getTileTraversalCost(waterCell, ['water', 'ground']), 1.0);
  assert.equal(getTileTraversalCost(groundCell, ['water', 'ground']), 2.25);

  // Weighted pathfinding test on a synthetic 5x3 strip where row 0 is water and row 1 is ground
  const customGrid: TileCell[][] = Array.from({ length: GRID_ROWS }, (_, r) =>
    Array.from({ length: GRID_COLS }, (_, c) => ({
      col: c,
      row: r,
      terrain: r === 5 ? 'void_water' : 'ground_plain',
      domain: r === 5 ? 'water' : 'ground',
      walkable: r !== 5,
      buildable: r !== 5,
      elevation: r === 5 ? 0 : 1,
    }))
  );

  // A unit with ['ground', 'water'] going from (4, 5) to (8, 5) will step onto row 6 (ground, weight 1.0)
  // rather than swimming straight across row 5 (water, weight 2.25)
  const pathPreferGround = findWalkablePathOnGrid(
    customGrid,
    { col: 4, row: 5 },
    { col: 8, row: 5 },
    new Set(),
    ['ground', 'water']
  );
  assert.ok(
    pathPreferGround.some((step) => step.row !== 5),
    'Expected unit with ["ground", "water"] to detour through ground tiles due to lower traversal weight'
  );

  // Conversely, a unit with ['water', 'ground'] prefers staying on row 5 (water, weight 1.0)
  const pathPreferWater = findWalkablePathOnGrid(
    customGrid,
    { col: 4, row: 5 },
    { col: 8, row: 5 },
    new Set(),
    ['water', 'ground']
  );
  assert.ok(
    pathPreferWater.every((step) => step.row === 5),
    'Expected unit with ["water", "ground"] to stay on water tiles (index 0)'
  );
});

test('4. Polyomino (Tetris) footprints & 1x1 resource collisions work without territory radius restriction', () => {
  const grid = generateTilemapGrid('map_korhal_basin');
  assert.equal(grid.length, 32);
  assert.equal(grid[0].length, 24);

  // Can build an L-tetromino anywhere on open ground (e.g., col 10, row 10) even with 0 existing structures
  const canPlaceL = canPlaceStructureOnGrid(
    grid,
    10,
    10,
    FOOTPRINT_SHAPES.tetromino_L,
    [],
    [],
    'martians'
  );
  assert.equal(canPlaceL, true);

  // Cannot place on water (0, 0)
  assert.equal(
    canPlaceStructureOnGrid(grid, 0, 0, FOOTPRINT_SHAPES.square_2x2, [], [], 'martians'),
    false
  );

  // Cannot overlap a 1x1 resource node at (10, 12) which is part of tetromino_L anchored at (10, 10)
  const resourceAt10_12 = [{ col: 10, row: 12, remainingAmount: 100 }];
  assert.equal(
    canPlaceStructureOnGrid(grid, 10, 10, FOOTPRINT_SHAPES.tetromino_L, [], resourceAt10_12, 'martians'),
    false
  );
});

test('5. Structure lifecycle enforces buildDurationSec AND initialSpawnCooldownSec before first unit spawns', () => {
  const dummyStructure = {
    lifecycleState: 'constructing' as const,
    buildDurationSec: 4.0,
    buildProgressSec: 0,
    initialSpawnCooldownSec: 3.0,
    spawnIntervalSec: 8.0,
    spawnTimerSec: 0,
    hasCompletedInitialCooldown: false,
    unitArchetype: {
      id: 'unit_test',
      name: 'Test Unit',
      role: 'melee' as const,
      traversableDomains: ['ground' as const],
      baseAttributes: { strength: 10, agility: 10, mass: 10, intelligence: 10 },
      isRanged: false,
      visualScale: 1,
    },
  };

  // Step 2.0s: still constructing -> should NOT spawn unit or attack
  const step1 = advanceStructureLifecycle(dummyStructure, 2.0);
  assert.equal(dummyStructure.lifecycleState, 'constructing');
  assert.equal(step1.shouldSpawnUnit, false);
  assert.equal(step1.canAttack, false);

  // Step another 2.0s (total 4.0s): finishes construction -> transitions to 'active', STILL should NOT spawn immediately!
  const step2 = advanceStructureLifecycle(dummyStructure, 2.0);
  assert.equal(dummyStructure.lifecycleState, 'active');
  assert.equal(step2.shouldSpawnUnit, false);
  assert.equal(step2.canAttack, true);

  // Step 2.5s while active (< 3.0s initialSpawnCooldownSec): still waiting for initial cooldown
  const step3 = advanceStructureLifecycle(dummyStructure, 2.5);
  assert.equal(step3.shouldSpawnUnit, false);

  // Step 0.6s (total 3.1s active >= 3.0s initialSpawnCooldownSec): FIRST unit spawns!
  const step4 = advanceStructureLifecycle(dummyStructure, 0.6);
  assert.equal(step4.shouldSpawnUnit, true);
  assert.equal(dummyStructure.hasCompletedInitialCooldown, true);

  // Next unit now requires full spawnIntervalSec (8.0s), so +3.5s is not enough
  const step5 = advanceStructureLifecycle(dummyStructure, 3.5);
  assert.equal(step5.shouldSpawnUnit, false);

  // +4.6s more reaches 8.0s -> SECOND unit spawns!
  const step6 = advanceStructureLifecycle(dummyStructure, 4.6);
  assert.equal(step6.shouldSpawnUnit, true);
});

test('6. Unit stats, tactical movement speed scale, and short few-tiles ranged reach', () => {
  const tileSize = 18;
  const siegeStats = deriveUnitStats(
    { strength: 28, agility: 8, mass: 34, intelligence: 10 },
    'siege',
    false,
    tileSize
  );
  assert.ok(siegeStats.maxHp > 400);
  // Tactical movement speed feels like hundreds of meters (~8 to 26 px/s)
  assert.ok(siegeStats.moveSpeedPxPerSec >= 7 && siegeStats.moveSpeedPxPerSec <= 25);

  const rangedStats = deriveUnitStats(
    { strength: 10, agility: 15, mass: 9, intelligence: 19 },
    'ranged',
    true,
    tileSize
  );
  // Ranged reach is equivalent to just a few tiles (2 to 3.5 tiles)
  assert.ok(
    rangedStats.attackRangePx >= tileSize * 2 && rangedStats.attackRangePx <= tileSize * 3.5,
    `Expected ranged attackRangePx (${rangedStats.attackRangePx}) to be between 2 and 3.5 tiles (${tileSize * 2}..${tileSize * 3.5})`
  );

  assert.equal(checkSkirmishOutcome(500, 0), 'victory');
  assert.equal(checkSkirmishOutcome(0, 500), 'defeat');
  assert.equal(calculateCardUpgradeRequirements(1).duplicatesRequired, 2);
});
