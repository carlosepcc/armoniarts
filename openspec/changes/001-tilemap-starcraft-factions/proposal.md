# Change 001: Tilemap 24×32, StarCraft-Inspired Factions & Construction Lifecycle

## Why
Para lograr la precisión táctica de *StarCraft* y *Domination Wars*, necesitamos pasar de coordenadas libres con radio de territorio a una rejilla lógica (`24×32`) donde los tipos de terreno determinen por dónde caminan las unidades y dónde se ubican estructuras con formas poliminó (`1×1`, `2×1`, `2×2` o tipo Tetris). Además, las estructuras deben requerir un tiempo real de construcción y un cooldown inicial antes de producir su primera unidad, y el universo del juego adopta las tres razas sci-fi **Gonn**, **Martians** y **Qentauri** en una arquitectura por capas, eliminando modos secundarios para pulir el núcleo jugable.

## What Changes
1. **Rejilla `24×32` (`Tilemap`)**:
   - Casillas con terrenos `void_water`, `cliff_rock`, `ground_plain` y `mineral_ground`.
   - Navegación de unidades restringida a casillas transitables (`walkable`).
   - Nodos de recursos de `1×1` casilla y estructuras con huella poliminó `TileOffset[]`.
2. **Construcción Libre y Cooldown Inicial**:
   - Retiro de la restricción de radio territorial al colocar cartas.
   - Adición de `buildDurationSec` (fase `constructing`) e `initialSpawnCooldownSec` (espera inicial tras construirse antes de producir la primera unidad).
3. **Razas `Gonn`, `Martians` y `Qentauri`**:
   - Reemplazo de facciones previas por las 3 razas sci-fi inspiradas en Zerg, Terran y Protoss, organizadas en dos capas (Rol Funcional + Skin/Multiplicadores Raciales).
4. **Foco en el Modo Principal**:
   - Eliminación de modos alternativos (Niebla, Jungla, Tormenta) y del editor de islas defensivas PvP.

## Tasks
- [x] Inicializar `openspec/` con `project.md` y especificaciones base.
- [x] Rediseñar `src/game/types.ts` con `TilemapGrid`, `TileOffset`, ciclo `constructing`/`active`, y facciones `gonn`, `martians`, `qentauri`.
- [x] Implementar lógica de rejilla `24×32`, formas poliminó, pathfinding por terreno transitable y ciclo de construcción en `src/game/rules.ts`.
- [x] Actualizar pruebas unitarias en `src/game/rules.test.ts` validando cooldown inicial, formas Tetris y terrenos.
- [x] Actualizar `src/game/engine.ts` y la interfaz (`GameHud`, `TitleScreen`, `StatusModal`, `App`) para renderizar el tilemap `24×32`, previsualización de casillas y las tres razas.
