# Specification: Tilemap 24×32, Ordered Traversal Domains & Polyomino Structures

## Overview
Define las reglas espaciales del campo de batalla en rejilla (`24×32`), la lista ordenada de dominios transitables (`traversableDomains`) con pesos para el pathfinding, las formas poliminó para estructuras y el ciclo de vida de construcción y producción.

## Requirements

### Requirement: Grid Dimensions & Ordered Traversal Domains
El mapa principal DEBE representarse como una rejilla discreta de `24` columnas por `32` filas donde cada casilla declara su `TerrainType`, su dominio físico (`domain: 'ground' | 'water' | 'cliff'`) y su bandera `buildable`.
Cada unidad DEBE declarar `traversableDomains: TraversalDomain[]` como una lista ordenada de **más preferido a menos preferido** (por ejemplo, `['ground']` para terrestre pura, `['ground', 'water']` para una unidad que prefiere tierra pero puede cruzar agua, o `['water', 'ground']` si prefiere agua).

#### Scenario: Unidades sólo caminan por sus dominios declarados y prefieren los primeros de la lista
- **GIVEN** una unidad con `traversableDomains: ['ground', 'water']`
- **WHEN** `getTileTraversalCost` y `findWalkablePathOnGrid` evalúan casillas
- **THEN** las casillas con `domain: 'cliff'` son intransitables (`null`), las casillas `'ground'` tienen peso base `1.0` (índice 0) y las casillas `'water'` tienen un peso mayor (`2.25`, índice 1), haciendo que el pathfinding A* elija tierra siempre que sea razonable y sólo cruce agua cuando sea necesario o mucho más directo.

### Requirement: Polyomino Structure Footprints & 1x1 Resources
Las estructuras DEBEN definir su ocupación en la rejilla mediante una lista de offsets relativos `TileOffset[]` (`dc`, `dr`), soportando tamaños `1×1`, `2×1`, `2×2` y formas arbitrarias tipo Tetris (`L`, `T`, `Z`). Los nodos de recursos DEBEN ocupar exactamente `1×1` casilla.

#### Scenario: Validación de colocación de estructura sin radio de territorio
- **GIVEN** una carta de estructura con huella `TileOffset[]` y una casilla ancla `(col, row)` en cualquier parte del mapa
- **WHEN** se evalúa `canPlaceStructureOnGrid`
- **THEN** la colocación es válida si y sólo si todas las casillas del poliminó están dentro de `24×32`, tienen `buildable === true`, no están ocupadas por otra estructura ni por un recurso `1×1`, y cumplen el filtro de terreno de la facción (`canFactionBuildOnTile`), sin exigir cercanía a otras estructuras aliadas.

### Requirement: Structure Construction Time & Initial Spawn Cooldown
Las estructuras productoras o defensivas NO DEBEN generar unidades ni atacar inmediatamente al colocarse en el mapa.

#### Scenario: Construcción seguida de cooldown inicial antes de la primera unidad
- **GIVEN** una estructura recién colocada con `buildDurationSec > 0`, `initialSpawnCooldownSec > 0` y `spawnIntervalSec > 0`
- **WHEN** transcurre el tiempo de simulación
- **THEN** durante los primeros `buildDurationSec` segundos su estado es `constructing` y no avanza la producción de unidades ni dispara; al alcanzar `buildDurationSec`, pasa a estado `active` con `0` unidades generadas y debe esperar `initialSpawnCooldownSec` segundos adicionales antes de generar su primera unidad; las unidades posteriores se generan cada `spawnIntervalSec` segundos.
