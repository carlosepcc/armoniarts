# Project Context: Armonia — Tactical Tilemap RTS

## Purpose
**Armonia** es un juego de estrategia en tiempo real (RTS) táctico con mazos de cartas e inspiración directa en *Domination Wars* y *StarCraft*. Combina el ritmo accesible de despliegue de estructuras y hechizos por cartas con una base sistémica profunda de terrenos por casillas (tilemap `24×32`), huellas de estructuras poliminó (tipo Tetris), tiempos reales de construcción y enfriamiento inicial, y físicas derivadas exclusivamente de 4 atributos fundamentales.

## Tech Stack
- **Frontend & UI Shell**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Simulation & Rendering**: HTML5 Canvas 2D a 60fps con delta-time acotado (`Math.min(dt, 0.1)`), cámara con screen-shake, hitstop y pool preasignado de partículas (0-GC en bucle caliente).
- **Audio**: Sintetizador procedural Web Audio API (`src/game/audio.ts`).
- **Testing & Specs**: Pruebas unitarias nativas con `node:test` (`src/game/rules.test.ts`) y especificaciones vivas en `openspec/`.

## Core Architectural Principles

### 1. Derivación Pura por 4 Atributos Fundamentales
Ninguna unidad ni raza almacena velocidades fijas de desplazamiento, recolección o ataque. Todo cálculo dinámico emerge en tiempo de ejecución de:
- `strength` (**Fuerza**): Poder físico de impacto, perforación de materiales duros y capacidad de carga.
- `agility` (**Agilidad**): Cadencia de acción, velocidad de locomoción e impulso.
- `mass` (**Masa / Peso**): Inercia estructural, puntos de vida máximos, resistencia a empuje y penalización gravitatoria al moverse.
- `intelligence` (**Inteligencia**): Afinidad psiónica/arcana para extraer materiales complejos, alcance y eficiencia táctica.

### 2. Rejilla Táctica (Tilemap `24×32`) y Terrenos
- El campo de batalla es una matriz discreta de **24 columnas × 32 filas**.
- Cada casilla posee un `TerrainType` explícito (`void_water`, `cliff_rock`, `ground_plain`, `mineral_ground`) que determina si es **transitable** (`walkable`) para unidades terrestres y si es **construible** (`buildable`) para estructuras.
- Las unidades sólo pueden desplazarse por casillas transitables para su tipo de locomoción (`ground` actualmente), rodeando agua, acantilados y obstáculos mediante navegación en rejilla.

### 3. Huellas Poliminó (Tetris) y Nodos 1×1
- Cada estructura define su forma espacial como una lista de desplazamientos de casilla `TileOffset[]` respecto a su casilla ancla `(col, row)`. Esto soporta desde `1×1`, `2×1` y `2×2` hasta formas `L`, `T` o `Z`.
- Los nodos de recursos ocupan exactamente `1×1` casilla (`[{ dc: 0, dr: 0 }]`).

### 4. Construcción Libre y Ciclo de Vida de Estructuras
- No existe restricción de radio alrededor de edificios aliados para construir: cualquier conjunto de casillas construibles y vacías es válido (con soporte por capas para reglas futuras por raza).
- Ninguna estructura produce unidades ni ataca al instante de colocarse:
  1. **Fase de Construcción (`buildDurationSec`)**: La estructura se materializa progresivamente en el mapa.
  2. **Cooldown Inicial (`initialSpawnCooldownSec`)**: Una vez completada la construcción, la estructura debe esperar su cooldown inicial antes de generar su primera unidad.
  3. **Intervalo Regular (`spawnIntervalSec`)**: Tiempo entre unidades subsecuentes después de la primera.

### 5. Razas Estilo StarCraft en Capas (`Gonn`, `Martians`, `Qentauri`)
- **Capa 1 (Rol Funcional / Arquetipo)**: Define la mecánica base de la carta o unidad.
- **Capa 2 (Identidad y Catálogo Racial)**: Aplica los multiplicadores de atributos, estética vectorial, nombres y posibles overrides exclusivos de cada raza:
  - **Gonn** (*Análoga a Zerg*): Biomasa mutagénica, alta agilidad, menor masa.
  - **Martians** (*Análoga a Terran*): Aleación marciana, equilibrio industrial en fuerza y masa.
  - **Qentauri** (*Análoga a Protoss*): Éter psiónico, alta inteligencia y potencia por unidad.
