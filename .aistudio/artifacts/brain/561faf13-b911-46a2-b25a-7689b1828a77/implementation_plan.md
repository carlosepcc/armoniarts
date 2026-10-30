# Estructuras y Unidades Clásicas de StarCraft (Formato Domination Wars)

Adaptación del catálogo de estructuras y unidades de **Armonia** para utilizar las estructuras y unidades básicas de *StarCraft* dentro de las tres facciones (**Martians**, **Gonn**, **Qentauri**), siguiendo las mecánicas autónomas de partida rápida en móvil estilo *Domination Wars* y documentando todo el sistema bajo **OpenSpec**.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisiones Confirmadas en la Fase 1:**
> - **Referencia Viva en el Repositorio**: Se guardará la lista completa de estructuras y unidades de *StarCraft / Brood War* proporcionada como un documento `.md` vivo dentro de `openspec/` para consulta y evolución continua.
> - **Mazo Estricto de 5 Cartas por Raza**: Cada facción contará exactamente con **5 cartas jugables** (4 cartas en mano + 1 carta en cola de *Siguiente*):
>   1. **1 Estructura de producción de recolectores** (generación autónoma de obreros).
>   2. **2 Estructuras de producción de unidades de combate** (cada estructura produce autónomamente un único tipo de unidad clásica).
>   3. **1 Estructura tipo torre defensiva de objetivo único** (capaz de atacar objetivos tanto de **tierra** como de **aire** sin daño en área).
>   4. **1 Tarjeta de poder de un solo uso de daño en área** (hechizo táctico AoE).
> - **Nomenclatura Híbrida**: Se mantienen los nombres de facción (**Dominio Martians**, **Enjambre Gonn**, **Cónclave Qentauri**) combinados con los nombres clásicos de estructuras y unidades de *StarCraft*.

### Mapeo de Estructuras, Unidades y Poderes por Facción

| Rol Funcional (`FunctionalRoleId`) | Dominio Martians (*Terran*) | Enjambre Gonn (*Zerg*) | Cónclave Qentauri (*Protoss*) |
| :--- | :--- | :--- | :--- |
| **Base Principal (Ciudadela 2×2)** | **Centro de Mando** *(Command Center)* | **Colmena / Hatchery** *(Hatchery)* | **Nexo** *(Nexus)* |
| **1. Estructura Recolectora (2×1)** | **Centro de Mando Anexo** → produce **VCE (SCV)** | **Criadero (Hatchery)** → produce **Zángano (Drone)** | **Nexo de Sondas** → produce **Sonda (Probe)** |
| **2. Estructura Combate 1 (2×2)** | **Barracones (Barracks)** → produce **Marine** *(u opción Murciélago de Fuego / Firebat)* | **Estanque de Generación (Spawning Pool)** → produce **Zergling** | **Acceso (Gateway)** → produce **Zealot** |
| **3. Estructura Combate 2 (2×1)** | **Fábrica (Factory)** → produce **Goliat (Goliath)** | **Cubil de Hidraliscos (Hydralisk Den)** → produce **Hidralisco (Hydralisk)** | **Núcleo Cibernético (Cybernetics Core)** → produce **Dragón (Dragoon)** |
| **4. Torre Defensiva 1×1 (Tierra y Aire, Objetivo Único)** | **Búnker / Torreta de Misiles** *(Bunker / Missile Turret)* | **Colonia de Esporas / Hundida** *(Spore / Sunken Colony)* | **Cañón de Fotones** *(Photon Cannon)* |
| **5. Poder de Daño en Área (Hechizo)** | **Cañón Yamato / Bombardeo Orbital** | **Lluvia de Esporas Ácidas / Plaga** | **Tormenta Psiónica** *(Psionic Storm)* |

> [!NOTE]
> **Adaptación de Barracones + Fábrica en Martians (Terran)**: Para mantener la simetría funcional del motor de atributos entre las 3 razas sin perder la identidad de *StarCraft*, los **Barracones** despliegan infantería de asalto de corto alcance (**Murciélago de Fuego / Firebat** o **Marine de Choque**) y la **Fábrica** despliega artillería pesada a distancia (**Goliat**), o bien Barracones (**Marine**) y Fábrica (**Goliat**). Configuraremos los atributos y alcance de cada unidad por facción para que **Marine/Firebat**, **Zergling** y **Zealot** operen en el slot 1 y **Goliat**, **Hidralisco** y **Dragón** operen en el slot 2.

---

## 1. Overview & Core Concept

- **What It Does**: Transforma las cartas, estructuras en el mapa y unidades generadas de placeholders genéricos a las unidades y edificios icónicos de *StarCraft*, adaptados al bucle táctico autónomo de *Domination Wars* (construir la estructura cuesta recursos; una vez completado su tiempo de construcción y cooldown inicial, produce un único tipo de unidad de forma periódica y autónoma).
- **Target Audience / Persona**: Jugadores de estrategia móvil que buscan la fantasía táctica de *StarCraft* (Terran, Zerg, Protoss) destilada en partidas rápidas de 3–4 minutos con controles táctiles de una mano.
- **Key Value**: Claridad inmediata al reconocer el rol de cada edificio y unidad (*VCE/Zángano/Sonda*, *Marine/Zergling/Zealot*, *Goliat/Hidralisco/Dragón*, *Cañón de Fotones/Búnker/Colonia*) y un mazo compacto de 5 cartas donde siempre ves 4 en mano y 1 en espera.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Selección de Facción**: El jugador elige entre **Martians**, **Gonn** o **Qentauri** en la pantalla de título.
  2. **Despliegue Táctico (Mazo de 5 Cartas)**: En el dock inferior aparecen 4 cartas activas en mano y la 5ª carta en el slot **SIGUIENTE**. Al jugar cualquier carta, entra inmediatamente la carta en espera y la jugada pasa a ser la siguiente, creando un ciclo determinista y táctico sin azar innecesario.
  3. **Producción Autónoma**: Al colocar una estructura productora en la rejilla `24×32`, se construye durante `buildDurationSec`, espera `initialSpawnCooldownSec` y comienza a generar su unidad asignada cada `spawnIntervalSec`.
  4. **Defensa de Objetivo Único (Tierra y Aire)**: Las torres defensivas (`1×1`) detectan unidades enemigas tanto en dominio terrestre (`ground`/`water`) como aéreo (`air`) y disparan proyectiles de **objetivo único** (`splashRadius = 0`).
  5. **Santuario de Mazo (5 Cartas)**: El modal de mejoras muestra limpiamente las 5 cartas de la facción seleccionada con sus nombres y unidades de *StarCraft*.
- **Visual Identity & Theme**:
  - Conserva la paleta táctica oscura de alto contraste (`slate-950` / `slate-900`) con acentos cromáticos por facción: Azul Acero (`#38bdf8`) para **Martians**, Verde Mutagénico (`#a3e635`) y Púrpura para **Gonn**, y Cian Psiónico (`#22d3ee`) con Dorado (`#fbbf24`) para **Qentauri**.
  - Renderizado vectorial en el Canvas 2D adaptado a la silueta de las unidades clásicas (VCE/Zángano/Sonda, Marine/Zergling/Zealot, Goliat/Hidralisco/Dragón) y estructuras con medallón arquitectónico.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Catálogo de 5 Cartas Exactas por Raza (Ciclo 4 en Mano + 1 Siguiente)**
  - *Chosen Approach*: Reducir el catálogo activo a los 5 roles esenciales (`role_harvester_camp`, `role_combat_spawner_1` / `role_melee_spawner`, `role_combat_spawner_2` / `role_ranged_spawner`, `role_defense_turret`, `role_orbital_strike`).
  - *Why*: Se alinea 100% con el diseño pedido (2 estructuras de combate, 1 recolectora, 1 torre defensiva, 1 poder en área) y hace que la rotación de mano en móvil (4 + 1) sea completamente predecible y competitiva.
- **Decision 2: Torre Defensiva de Objetivo Único con Soporte Tierra + Aire (`targetDomains: ['ground', 'water', 'air']`)**
  - *Chosen Approach*: Configurar las estructuras defensivas para que evalúen objetivos cuyos dominios incluyan tierra o aire y disparen proyectiles de impacto único (`splashRadius: 0`) en lugar de daño en área.
  - *Why*: Cumple explícitamente la regla de *"torre defensiva de objetivo único (ataque tanto tierra como aire)"* y deja preparado el motor para cuando se incorporen unidades aéreas (Mutaliscos, Espectros, Exploradores) de la referencia viva.
- **Decision 3: Overrides de Unidad por Facción en Capa 2**
  - *Chosen Approach*: Permitir que cada facción defina en `roleSkins` tanto el nombre de su estructura y unidad de *StarCraft* como ajustes opcionales de combate (por ejemplo, que el **Marine** de Barracones o el **Zergling** / **Zealot** reflejen fielmente su identidad, mientras **Goliat**, **Hidralisco** y **Dragón** actúan como la segunda línea de fuego pesado/distancia).
  - *Why*: Respeta la arquitectura en capas de OpenSpec y permite que cada raza tenga personalidad propia sin romper la derivación pura por los 4 atributos fundamentales.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DOCUMENTACIÓN VIVA OPENSPEC                       │
│  • Referencia viva de unidades y estructuras de StarCraft / Brood War    │
│  • Propuesta de cambio y actualización de specs de facciones y estructuras│
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     CATÁLOGO EN CAPAS Y MOTOR DE REGLAS                  │
│  ┌──────────────────────────────┐    ┌────────────────────────────────┐  │
│  │ Capa 1: 5 Roles Base         │    │ Capa 2: Skins & Overrides Raza │  │
│  │ 1. Recolectores (2x1)        │───▶│ • Martians: VCE, Marine, Goliat│  │
│  │ 2. Combate I: Choque (2x2)   │    │ • Gonn: Zángano, Zergling,     │  │
│  │ 3. Combate II: Artillería(2x1│    │         Hidralisco             │  │
│  │ 4. Torre Defensiva 1x1 (T+A) │    │ • Qentauri: Sonda, Zealot,     │  │
│  │ 5. Poder Daño en Área (Spell)│    │             Dragón             │  │
│  └──────────────────────────────┘    └────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  SIMULACIÓN CANVAS 2D & HUD TÁCTICO MÓVIL                │
│  • Ciclo de mazo 4 en mano + 1 siguiente (5 cartas totales)              │
│  • Torres defensivas: Single-Target (splashRadius = 0) + Tierra/Aire     │
│  • IA rival actualizada para desplegar únicamente las 5 cartas base      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **Referencia Viva OpenSpec**: Nuevo documento de referencia con la taxonomía completa de *StarCraft* (Terran, Zerg, Protoss) proporcionada por el usuario, marcando qué elementos están activos en el formato *Domination Wars* actual y cuáles quedan en reserva para futuras expansiones.
- **Actualización de `CARDS_CATALOG` y `FACTIONS`**:
  - Las 5 cartas base representan las 4 estructuras construibles y el poder de daño en área.
  - En `FACTIONS`, cada `roleSkin` define los nombres exactos de *StarCraft* para estructuras, unidades y hechizos de área, además de permitir que la unidad producida tenga sus propiedades (como alcance o atributos base) ajustadas a la criatura/unidad de su raza.
- **Torre Defensiva Single-Target Tierra/Aire**:
  - Las estructuras con `isDefenseTower: true` verifican que el objetivo sea terrestre o aéreo (`targetDomains: ['ground', 'water', 'air']`) y emiten proyectiles con `splashRadius: 0` para garantizar daño estricto a un solo objetivo.
- **Pruebas Unitarias**:
  - Se ampliará la suite de pruebas para verificar que el catálogo contiene exactamente las 5 cartas requeridas, que cada raza resuelve sus nombres de estructuras y unidades de *StarCraft*, y que las torres defensivas operan sobre un único objetivo tanto de tierra como de aire.
