# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

MisFinanzas v2 — PWA de finanzas personales 100% offline, vanilla JS sin frameworks ni dependencias (`devDependencies` vacío). Toda la UI está en español. Pensada para usarse **principalmente en móvil** (bottom tabs + FAB); el usuario está en El Salvador (UTC−6, moneda $).

## Comandos

```bash
npm run build   # node build.js → dist/index.html (archivo único) + dist/sw.js + dist/manifest.json
npm test        # node --test test/*.test.js (56 tests)
node --test test/analytics.test.js   # un solo archivo de tests
npm run dev     # build + open (OJO: abre dist/MisFinanzas.html, que ya no se regenera — abrir dist/index.html)
```

El build necesita red solo la primera vez: descarga Chart.js y las fuentes DM Sans/DM Mono y las cachea en `vendor/` (commiteado). Después es 100% offline.

## Arquitectura

### Pipeline de build (build.js)

`src/` es multi-archivo; `dist/index.html` es un único HTML autocontenido:

1. CSS: concatena `src/styles/{base,themes,layout,components}.css` + fuentes inlinadas en base64 → `<style>` en el `<head>`.
2. JS: Chart.js + cada módulo de `MODULE_ORDER` envuelto en IIFE `(function(){...})()` → reemplaza los `<script src>` de `src/index.html`.
3. El regex del build elimina el bloque `if (typeof module !== 'undefined')...` de cada módulo — **ese bloque debe mantener exactamente ese formato** (cierre `}` en columna 0).
4. El manifest PWA se genera desde el objeto `MANIFEST` dentro de build.js (no hay manifest.json fuente).

**Al crear un módulo nuevo hay que registrarlo en 4 lugares:** `MODULE_ORDER` en build.js (el orden importa: icons → db → sync → analytics → pwa → nav → vistas), `<script src>` en src/index.html, la navegación (sidebar + drawer en src/index.html y `_SECTION_LABELS` en nav.js) y su `<section class="view" id="view-X">`.

### Patrón de módulo

Cada módulo expone su API en el namespace global `MF` y con dual-export para tests en Node:

```js
var _fooAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.foo = _fooAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _fooAPI; }
```

Los módulos de lógica pura (db, sync, analytics, icons) no tocan el DOM → son los testeables. Los tests mockean `localStorage`, `crypto` y `window` como globals (ver cabecera de test/db.test.js).

### Patrón de vista

Cada vista tiene `render()` que: llama `MF.nav.setFabAction(fn|null)` (acción del botón +), hace `MF.db.loadData()`, construye HTML por concatenación de strings, lo inyecta con `container.insertAdjacentHTML`, y registra event listeners con delegación (`closest('button[data-action]')`). El router (nav.js, hash-based `#seccion`) llama `MF[seccion].render()` en cada navegación — las vistas se re-renderizan completas, no hay estado persistente de UI.

Modales: `MF.nav.showModal(html, titulo, botones)` — los botones no cierran el modal automáticamente; cada action llama `MF.nav.closeModal()`. Feedback con `MF.nav.toast(msg, 'success'|'error'|'info')`.

### Regla de seguridad XSS

**Todo dato del usuario interpolado en HTML pasa por `MF.nav.esc()`** — sin excepciones. Solo los SVG de `MF.icons.*` (estáticos) se interpolan directo.

### Datos (db.js)

- Una sola clave de localStorage: `misfinanzas_v2`. `loadData()` devuelve el objeto completo; toda mutación es load → modificar → `saveData(db)`.
- Colecciones: `accounts, cards, transactions, budgets, goals, debts, recurring, transfers, installments, categories` + `settings` + `_meta`.
- IDs: `MF.db.generateId()` (UUID v4 con polyfill). Todo registro lleva `createdAt`/`updatedAt` ISO — **actualizar `updatedAt` en cada edición**: el merge de sync resuelve conflictos por timestamp (gana el más reciente).
- Migraciones: pipeline encadenado `_MIGRATIONS[v]` v1→v2→vN, **siempre aditivas, nunca destructivas**. La v1 (`misfinanzas_v1`) se migra automáticamente al cargar.
- Fechas de transacción: string local `YYYY-MM-DD` (sin hora). Cuidado con `new Date().toISOString()`: es UTC — en UTC−6 después de las 6 p.m. "hoy" en UTC ya es mañana. Preferir helpers de fecha local.
- Los saldos de cuentas/tarjetas son **manuales**: registrar transacciones, transferencias o pagos de deuda NO ajusta ningún saldo (decisión de diseño actual).

### Sync (sync.js)

Export JSON completo / import incremental con preview: por colección, merge por id — id nuevo se agrega, id existente gana el `updatedAt` más reciente, nunca se borra nada local. `settings` no se mezcla.

### Quick add desde iOS (quickadd.js)

Ruta de cliente `#quick-add?desc=…&amount=…` (hash, no query string — el SW haría cache-miss con query) que abre el modal de gastos pre-llenado vía `MF.gastos.openAddModal(null, prefill)`. El módulo también genera un `.shortcut` (plist XML) para el atajo de iOS "pagar con Apple Pay → registrar gasto". **iOS solo instala atajos firmados por Apple**: la vía principal es el enlace de iCloud guardado en `settings.applePayShortcutUrl`; el plist sin firmar se firma en Mac con `shortcuts sign -m anyone -i in.shortcut -o out.shortcut`. Spec completo: `docs/superpowers/specs/2026-07-28-quick-add-applepay-design.md`.

### Estilos

Tokyo Night con custom properties en base.css (`--bg, --accent, --income, --expense…`); tema claro via `[data-theme="light"]` en themes.css — **usar siempre las variables, nunca hex directos** (excepto la paleta de colores de datos: `#7aa2f7 #ff9e64 #bb9af7 #9ece6a #f7768e…`). Mobile-first: breakpoints escala Tailwind (480/640/768/1024/1280/1536); `<768px` = bottom tabs + FAB + drawer "Más", `≥768px` = sidebar. Componentes reutilizables en components.css (`.card, .list-item, .btn, .form-*, .progress-bar, .toggle, .empty-state`); las vistas los combinan con estilos inline para layout puntual — evitar inline para cosas que necesiten media queries.

### Vista especial: Salario

`salario.js` no usa la DB: es una calculadora salarial de El Salvador (ISR/ISSS/AFP 2025, mensual/quincenal + modo prestador de servicios con IVA/retención). Las tablas ISR están hardcodeadas y hay que actualizarlas cuando cambie la ley.

### CI/CD

`.github/workflows/main.yml`: build + tests + deploy a GitHub Pages (artifact = `dist/`, sitio en `https://josuepalaci.github.io/finanzas/`). El trigger apunta a `main` pero la rama real es `master`, así que **hoy el deploy solo corre con `workflow_dispatch` manual** — un push no publica nada.

## Flujo de trabajo para features nuevas

Este repo se desarrolla con las skills de superpowers:

1. `superpowers:brainstorming` antes de cualquier feature nueva (requisitos + diseño).
2. `superpowers:writing-plans` para specs multi-paso (los planes históricos vivían en `docs/superpowers/plans/`).
3. `superpowers:test-driven-development` — la lógica nueva va en módulos puros testeables (patrón analytics/sync) con tests en `test/`.
4. `superpowers:verification-before-completion` + `npm test` y `npm run build` antes de dar algo por terminado.
5. Verificación visual: abrir `dist/index.html` tras el build; probar SIEMPRE el viewport móvil (~390px), es el uso principal.
