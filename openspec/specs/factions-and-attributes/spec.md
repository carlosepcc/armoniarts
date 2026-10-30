# Specification: Factions (Gonn, Martians, Qentauri) & Attribute Physics

## Overview
Define la arquitectura separada en capas para las tres razas inspiradas en *StarCraft* (**Gonn**, **Martians**, **Qentauri**) y las fórmulas puras que derivan velocidades, extracción y combate a partir de los 4 atributos fundamentales.

## Requirements

### Requirement: Layered Faction Architecture
El sistema de facciones DEBE separar el **Arquetipo Funcional** (`FunctionalRoleId`) de la **Presentación y Modificadores Raciales** (`FactionConfig` y `FactionSkinOverrides`) para que **Gonn**, **Martians** y **Qentauri** compartan roles tácticos en el MVP mientras mantienen estadísticas, nombres, recursos esenciales y renderizado vectorial propios, permitiendo divergencia futura sin reescribir el motor.

#### Scenario: Selección de Gonn, Martians o Qentauri
- **GIVEN** cualquiera de las 3 razas (`gonn`, `martians`, `qentauri`)
- **WHEN** una unidad o estructura de esa raza entra en juego
- **THEN** sus atributos base (`strength`, `agility`, `mass`, `intelligence`) se multiplican por `faction.attributeMultipliers` y su barra de recurso esencial muestra la identidad de la raza (**Biomasa Mutagénica**, **Aleación Marciana** o **Éter Psiónico**).

### Requirement: Pure Fundamental Attribute Derivation
Ninguna entidad DEBE almacenar velocidades precalculadas de movimiento, picado de recursos o cadencia de ataque.

#### Scenario: Derivación de velocidad y extracción
- **GIVEN** los atributos efectivos `(strength, agility, mass, intelligence)` de una unidad y un material con `(hardness, arcaneComplexity)`
- **WHEN** se calculan `deriveMovementSpeed` y `deriveExtractionRate`
- **THEN** la velocidad de movimiento aumenta con `agility` y `strength` pero disminuye con `mass` y carga transportada, y la tasa de extracción pondera `strength` frente a `hardness` e `intelligence` frente a `arcaneComplexity`.
