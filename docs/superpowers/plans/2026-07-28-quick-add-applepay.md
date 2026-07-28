# Registro rápido desde atajo de iOS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un atajo de iOS registre un gasto en MisFinanzas pasando descripción y monto por URL, con confirmación en la app y trazabilidad del origen.

**Architecture:** Un módulo nuevo `quickadd.js` expone funciones puras (`parseIntent`, `isIOS`, `resolveAccount`, `buildShortcutPlist`) más los efectos (`consume`, `downloadShortcut`, `renderInstallCard`). El router de `nav.js` aprende a tolerar un query string dentro del hash; `consume()` traduce el intent a un prefill y reutiliza el modal de `gastos.js`. No hay backend: todo ocurre en el cliente sobre `localStorage`.

**Tech Stack:** Vanilla JavaScript ES2023 (sin frameworks, sin dependencias), `node --test` para pruebas, build script propio (`build.js`) que inlina módulos en un HTML único.

**Spec:** `docs/superpowers/specs/2026-07-28-quick-add-applepay-design.md`

## Global Constraints

- Sin dependencias externas nuevas. `devDependencies` sigue vacío.
- Cada módulo termina con el doble export: `window.MF.<nombre>` y `module.exports`. El build elimina el bloque de `module.exports` con la regex de `build.js:88`, así que ese bloque debe abrir con `if (typeof module` y cerrar con un `}` a columna cero.
- Todo dato de usuario interpolado en HTML pasa por `MF.nav.esc()` (convención de `nav.js:26`).
- El campo `desc` que llega por URL es entrada externa no confiable: `esc()` es obligatorio.
- Sin migración de esquema. `settings.applePayAccount` se lee defensivamente para que las bases v2 existentes sigan funcionando.
- Textos de UI en español. Nombres de variables, funciones y mensajes de commit en inglés.
- **Los pasos de commit de este plan no se ejecutan sin autorización explícita del usuario** (regla de su `CLAUDE.md`). Quedan documentados para cuando la dé.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/modules/quickadd.js` (nuevo) | Traducir un intent de URL a un prefill de transacción; generar y descargar el `.shortcut`; renderizar la card de instalación |
| `test/quickadd.test.js` (nuevo) | Cubrir las cuatro funciones puras del módulo |
| `src/modules/nav.js` | Router tolerante a query string en el hash; disparar `consume()` en `init()` |
| `src/modules/db.js` | Campo `settings.applePayAccount` en la DB vacía |
| `src/modules/categorias.js` | Categoría por defecto `Apple Pay`; exportar `DEFAULT_CATS` |
| `src/modules/gastos.js` | Aceptar prefill en el modal, persistir `source`, mostrar badge de origen |
| `src/modules/configuracion.js` | Reservar el slot donde `quickadd` monta su card |
| `build.js` | Registrar `quickadd.js` en `MODULE_ORDER` |
| `src/index.html` | Registrar el `<script>` del módulo |

---

## Task 1: Módulo `quickadd.js` con las funciones de parseo

**Files:**
- Create: `src/modules/quickadd.js`
- Create: `test/quickadd.test.js`
- Modify: `build.js:82-86` (constante `MODULE_ORDER`)
- Modify: `src/index.html:146` (después del `<script>` de `categorias.js`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `parseIntent(hash: string) => {desc: string, amount: number, cat: string, src: string} | null`
  - `isQuickAddHash(hash: string) => boolean` — distingue "no era para mí" de "venía dirigido a mí pero traía datos inválidos"
  - `isIOS(nav: {userAgent?: string, maxTouchPoints?: number}) => boolean`
  - `resolveAccount(db: object) => string` (id de cuenta, o `''` si no hay ninguna)
  - Constantes `QUICKADD_SECTION = 'quick-add'`, `DEFAULT_CAT = 'Apple Pay'`, `DEFAULT_SOURCE = 'applepay'`, `MAX_DESC = 120`

- [ ] **Step 1: Escribir el test que falla**

Crear `test/quickadd.test.js`:

```js
// test/quickadd.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const {
  parseIntent,
  isQuickAddHash,
  isIOS,
  resolveAccount,
  DEFAULT_CAT,
  DEFAULT_SOURCE,
  MAX_DESC
} = require('../src/modules/quickadd');

describe('parseIntent', () => {
  test('extrae los cuatro campos de un hash completo', () => {
    const r = parseIntent('#quick-add?desc=Super%20Selectos&amount=24.50&cat=Alimentaci%C3%B3n&src=applepay');
    assert.equal(r.desc, 'Super Selectos');
    assert.equal(r.amount, 24.5);
    assert.equal(r.cat, 'Alimentación');
    assert.equal(r.src, 'applepay');
  });

  test('acepta el hash sin el # inicial', () => {
    const r = parseIntent('quick-add?desc=Cafe&amount=3');
    assert.equal(r.desc, 'Cafe');
  });

  test('aplica los defaults de cat y src cuando no vienen', () => {
    const r = parseIntent('#quick-add?desc=Cafe&amount=3');
    assert.equal(r.cat, DEFAULT_CAT);
    assert.equal(r.src, DEFAULT_SOURCE);
  });

  test('decodifica descripciones con acentos y símbolos', () => {
    const r = parseIntent('#quick-add?desc=Caf%C3%A9%20%26%20Pan&amount=5');
    assert.equal(r.desc, 'Café & Pan');
  });

  test('trunca desc a MAX_DESC caracteres', () => {
    const largo = 'a'.repeat(MAX_DESC + 50);
    const r = parseIntent('#quick-add?desc=' + largo + '&amount=1');
    assert.equal(r.desc.length, MAX_DESC);
  });

  test('devuelve null si la sección no es quick-add', () => {
    assert.equal(parseIntent('#gastos?desc=Cafe&amount=3'), null);
  });

  test('devuelve null si no hay query string', () => {
    assert.equal(parseIntent('#quick-add'), null);
  });

  test('devuelve null si desc está vacío o es solo espacios', () => {
    assert.equal(parseIntent('#quick-add?desc=&amount=3'), null);
    assert.equal(parseIntent('#quick-add?desc=%20%20&amount=3'), null);
  });

  test('devuelve null si falta desc', () => {
    assert.equal(parseIntent('#quick-add?amount=3'), null);
  });

  test('devuelve null con montos inválidos', () => {
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=0'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=-5'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=abc'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe'), null);
  });

  test('devuelve null con entradas que no son string', () => {
    assert.equal(parseIntent(null), null);
    assert.equal(parseIntent(undefined), null);
    assert.equal(parseIntent(42), null);
  });
});

describe('isQuickAddHash', () => {
  test('reconoce un hash dirigido a quick-add, con o sin datos válidos', () => {
    assert.equal(isQuickAddHash('#quick-add?desc=Cafe&amount=3'), true);
    assert.equal(isQuickAddHash('#quick-add?desc=&amount=0'), true);
    assert.equal(isQuickAddHash('quick-add?x=1'), true);
  });

  test('rechaza hashes de otras secciones y entradas basura', () => {
    assert.equal(isQuickAddHash('#gastos'), false);
    assert.equal(isQuickAddHash('#quick-add'), false);
    assert.equal(isQuickAddHash(''), false);
    assert.equal(isQuickAddHash(null), false);
  });
});

describe('isIOS', () => {
  const UA_IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const UA_IPAD_12 = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const UA_MAC     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const UA_WIN     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

  test('detecta iPhone', () => {
    assert.equal(isIOS({ userAgent: UA_IPHONE, maxTouchPoints: 5 }), true);
  });

  test('detecta iPad antiguo por user agent', () => {
    assert.equal(isIOS({ userAgent: UA_IPAD_12, maxTouchPoints: 5 }), true);
  });

  test('detecta iPadOS 13+ que se reporta como Mac con touch', () => {
    assert.equal(isIOS({ userAgent: UA_MAC, maxTouchPoints: 5 }), true);
  });

  test('rechaza un Mac de escritorio sin touch', () => {
    assert.equal(isIOS({ userAgent: UA_MAC, maxTouchPoints: 0 }), false);
  });

  test('rechaza Windows', () => {
    assert.equal(isIOS({ userAgent: UA_WIN, maxTouchPoints: 0 }), false);
    assert.equal(isIOS({ userAgent: UA_WIN, maxTouchPoints: 10 }), false);
  });

  test('rechaza navigator ausente o vacío', () => {
    assert.equal(isIOS(null), false);
    assert.equal(isIOS(undefined), false);
    assert.equal(isIOS({}), false);
  });
});

describe('resolveAccount', () => {
  const db = (settings, accounts) => ({ settings, accounts });

  test('devuelve la cuenta configurada cuando existe', () => {
    const r = resolveAccount(db({ applePayAccount: 'b' }, [{ id: 'a' }, { id: 'b' }]));
    assert.equal(r, 'b');
  });

  test('cae a la primera cuenta si la configurada fue borrada', () => {
    const r = resolveAccount(db({ applePayAccount: 'zzz' }, [{ id: 'a' }, { id: 'b' }]));
    assert.equal(r, 'a');
  });

  test('cae a la primera cuenta si no hay preferencia', () => {
    assert.equal(resolveAccount(db({}, [{ id: 'a' }])), 'a');
    assert.equal(resolveAccount(db(undefined, [{ id: 'a' }])), 'a');
  });

  test('devuelve cadena vacía si no hay cuentas', () => {
    assert.equal(resolveAccount(db({}, [])), '');
    assert.equal(resolveAccount({}), '');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL con `Cannot find module '../src/modules/quickadd'`

- [ ] **Step 3: Crear el módulo con las funciones puras**

Crear `src/modules/quickadd.js`:

```js
// src/modules/quickadd.js
// Registro rápido desde un atajo de iOS: intent por URL y generación del .shortcut.

const QUICKADD_SECTION = 'quick-add';
const DEFAULT_CAT      = 'Apple Pay';
const DEFAULT_SOURCE   = 'applepay';
const MAX_DESC         = 120;

// ── isQuickAddHash ─────────────────────────────────────────────────────────
// Separa "este hash no era para mí" de "venía dirigido a mí pero con datos
// inválidos". El segundo caso merece un aviso al usuario; el primero, silencio.

function isQuickAddHash(hash) {
  if (typeof hash !== 'string') return false;
  const raw  = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');
  return qIdx >= 0 && raw.slice(0, qIdx) === QUICKADD_SECTION;
}

// ── parseIntent ────────────────────────────────────────────────────────────
// Traduce '#quick-add?desc=…&amount=…' a un objeto listo para prefill.
// Devuelve null ante cualquier entrada que no represente un gasto válido:
// la validación vive aquí, no en el llamador.

function parseIntent(hash) {
  if (!isQuickAddHash(hash)) return null;

  const raw  = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');

  let params;
  try {
    params = new URLSearchParams(raw.slice(qIdx + 1));
  } catch (_) {
    return null;
  }

  const desc = (params.get('desc') || '').trim().slice(0, MAX_DESC);
  if (!desc) return null;

  const amount = parseFloat(params.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    desc:   desc,
    amount: amount,
    cat:    (params.get('cat') || '').trim() || DEFAULT_CAT,
    src:    (params.get('src') || '').trim() || DEFAULT_SOURCE
  };
}

// ── isIOS ──────────────────────────────────────────────────────────────────
// Recibe el navigator por parámetro para poder testearlo sin DOM.

function isIOS(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ se identifica como Mac; solo el soporte multitáctil lo delata.
  return /Mac/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

// ── resolveAccount ─────────────────────────────────────────────────────────

function resolveAccount(db) {
  const accounts = (db && db.accounts) || [];
  if (!accounts.length) return '';
  const preferred = (db.settings && db.settings.applePayAccount) || '';
  if (preferred && accounts.some(a => a.id === preferred)) return preferred;
  return accounts[0].id;
}

// ── Exports ────────────────────────────────────────────────────────────────

const _quickaddAPI = {
  parseIntent,
  isQuickAddHash,
  isIOS,
  resolveAccount,
  QUICKADD_SECTION,
  DEFAULT_CAT,
  DEFAULT_SOURCE,
  MAX_DESC
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.quickadd = _quickaddAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _quickaddAPI;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS, sin fallos en `quickadd.test.js` ni en los cuatro archivos de test existentes.

- [ ] **Step 5: Registrar el módulo en el build**

En `build.js`, dentro de `MODULE_ORDER` (línea 82), agregar `'quickadd.js'` justo después de `'categorias.js'`:

```js
const MODULE_ORDER = [
  'icons.js', 'db.js', 'sync.js', 'analytics.js', 'pwa.js', 'nav.js',
  'categorias.js', 'quickadd.js', 'dashboard.js', 'cuentas.js', 'gastos.js', 'presupuestos.js',
  'metas.js', 'deudas.js', 'transferencias.js', 'recurrentes.js',
  'reporte.js', 'cuotas.js', 'salario.js', 'configuracion.js'
];
```

En `src/index.html`, después de la línea 146 (`<script src="modules/categorias.js"></script>`):

```html
  <script src="modules/quickadd.js"></script>
```

- [ ] **Step 6: Verificar que el build corre**

Run: `npm run build`
Expected: `Done! dist/index.html — <tamaño> KB`, sin errores.

- [ ] **Step 7: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/quickadd.js test/quickadd.test.js build.js src/index.html
git commit -m "feat(quickadd): add URL intent parsing for iOS shortcut"
```

---

## Task 2: Generación del archivo `.shortcut`

**Files:**
- Modify: `src/modules/quickadd.js` (agregar `buildShortcutPlist` antes del bloque de exports)
- Modify: `test/quickadd.test.js` (agregar el describe correspondiente)

**Interfaces:**
- Consumes: `QUICKADD_SECTION` de Task 1.
- Produces: `buildShortcutPlist(baseUrl: string) => string` — plist XML completo, determinista.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `test/quickadd.test.js`, y extender el `require` del encabezado para incluir `buildShortcutPlist`:

```js
describe('buildShortcutPlist', () => {
  const BASE = 'https://josuepalaci.github.io/finanzas/';

  test('produce un plist XML bien formado', () => {
    const plist = buildShortcutPlist(BASE);
    assert.ok(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(plist.includes('<!DOCTYPE plist PUBLIC'));
    assert.ok(plist.trimEnd().endsWith('</plist>'));
  });

  test('incluye las cuatro acciones en orden', () => {
    const plist = buildShortcutPlist(BASE);
    const orden = [
      'is.workflow.actions.ask',
      'is.workflow.actions.urlencode',
      'is.workflow.actions.ask',
      'is.workflow.actions.openurl'
    ];
    let cursor = 0;
    for (const id of orden) {
      const idx = plist.indexOf(id, cursor);
      assert.ok(idx > -1, 'falta la acción ' + id + ' después de la posición ' + cursor);
      cursor = idx + id.length;
    }
  });

  test('incluye la baseUrl recibida', () => {
    const plist = buildShortcutPlist('https://ejemplo.test/app/');
    assert.ok(plist.includes('https://ejemplo.test/app/#quick-add'));
  });

  test('descarta un hash preexistente en la baseUrl', () => {
    const plist = buildShortcutPlist('https://ejemplo.test/#configuracion');
    assert.ok(plist.includes('https://ejemplo.test/#quick-add'));
    assert.ok(!plist.includes('#configuracion'));
  });

  test('escapa los ampersands de la URL como entidades XML', () => {
    const plist = buildShortcutPlist(BASE);
    assert.ok(plist.includes('&amp;amount='));
    assert.ok(!/[^&]&amount=/.test(plist), 'quedó un & sin escapar');
  });

  test('coloca dos placeholders y los mapea por rango', () => {
    const plist = buildShortcutPlist(BASE);
    const url   = BASE + '#quick-add?desc=￼&amount=￼&src=applepay';
    const posDesc   = url.indexOf('￼');
    const posAmount = url.indexOf('￼', posDesc + 1);
    assert.ok(plist.includes('<key>{' + posDesc + ', 1}</key>'));
    assert.ok(plist.includes('<key>{' + posAmount + ', 1}</key>'));
  });

  test('es determinista: dos llamadas iguales producen el mismo string', () => {
    assert.equal(buildShortcutPlist(BASE), buildShortcutPlist(BASE));
  });

  test('tolera baseUrl vacía sin lanzar', () => {
    assert.ok(buildShortcutPlist('').includes('#quick-add'));
    assert.ok(buildShortcutPlist(null).includes('#quick-add'));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL con `TypeError: buildShortcutPlist is not a function`

- [ ] **Step 3: Implementar `buildShortcutPlist`**

En `src/modules/quickadd.js`, insertar antes del bloque `// ── Exports ──`:

```js
// ── Generación del .shortcut ───────────────────────────────────────────────
// El plist va sin firmar: iOS solo lo importa con "Permitir atajos no
// confiables" activado. Las instrucciones manuales son el camino de respaldo.

// U+FFFC (object replacement character) marca dónde Shortcuts inserta la
// salida de una acción previa dentro de un WFTextTokenString.
const TOKEN = '￼';

// UUIDs constantes, no aleatorios: dos descargas del mismo atajo deben ser
// byte a byte idénticas para que el test de determinismo tenga sentido.
const UUID_ASK_DESC   = 'C7A1F2E0-0001-4A00-9000-4D6973466E7A';
const UUID_ENCODE     = 'C7A1F2E0-0002-4A00-9000-4D6973466E7A';
const UUID_ASK_AMOUNT = 'C7A1F2E0-0003-4A00-9000-4D6973466E7A';

function _xmlEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Referencia a la salida de una acción previa, por UUID.
function _attachment(name, uuid) {
  return '<dict>'
    + '<key>OutputName</key><string>' + _xmlEsc(name) + '</string>'
    + '<key>OutputUUID</key><string>' + uuid + '</string>'
    + '<key>Type</key><string>ActionOutput</string>'
    + '</dict>';
}

// WFTextTokenString: un string con placeholders más el mapa rango → attachment.
function _tokenString(template, ranges) {
  const pairs = ranges
    .map(r => '<key>{' + r.pos + ', 1}</key>' + _attachment(r.name, r.uuid))
    .join('');
  return '<dict>'
    + '<key>Value</key><dict>'
    + '<key>attachmentsByRange</key><dict>' + pairs + '</dict>'
    + '<key>string</key><string>' + _xmlEsc(template) + '</string>'
    + '</dict>'
    + '<key>WFSerializationType</key><string>WFTextTokenString</string>'
    + '</dict>';
}

function _action(identifier, paramsXML) {
  return '<dict>'
    + '<key>WFWorkflowActionIdentifier</key><string>' + identifier + '</string>'
    + '<key>WFWorkflowActionParameters</key><dict>' + paramsXML + '</dict>'
    + '</dict>';
}

function buildShortcutPlist(baseUrl) {
  const base = String(baseUrl == null ? '' : baseUrl).replace(/#.*$/, '');
  const url  = base + '#' + QUICKADD_SECTION
             + '?desc=' + TOKEN + '&amount=' + TOKEN + '&src=' + DEFAULT_SOURCE;

  const posDesc   = url.indexOf(TOKEN);
  const posAmount = url.indexOf(TOKEN, posDesc + 1);

  const askDesc = _action('is.workflow.actions.ask',
      '<key>UUID</key><string>' + UUID_ASK_DESC + '</string>'
    + '<key>WFAskActionPrompt</key><string>' + _xmlEsc('¿En qué gastaste?') + '</string>'
    + '<key>WFInputType</key><string>Text</string>'
    + '<key>CustomOutputName</key><string>Descripcion</string>');

  const encodeDesc = _action('is.workflow.actions.urlencode',
      '<key>UUID</key><string>' + UUID_ENCODE + '</string>'
    + '<key>WFEncodeMode</key><string>Encode</string>'
    + '<key>WFInput</key>'
    + _tokenString(TOKEN, [{ pos: 0, name: 'Descripcion', uuid: UUID_ASK_DESC }])
    + '<key>CustomOutputName</key><string>DescripcionCodificada</string>');

  const askAmount = _action('is.workflow.actions.ask',
      '<key>UUID</key><string>' + UUID_ASK_AMOUNT + '</string>'
    + '<key>WFAskActionPrompt</key><string>' + _xmlEsc('¿Cuánto?') + '</string>'
    + '<key>WFInputType</key><string>Number</string>'
    + '<key>CustomOutputName</key><string>Monto</string>');

  const openUrl = _action('is.workflow.actions.openurl',
      '<key>WFInput</key>'
    + _tokenString(url, [
        { pos: posDesc,   name: 'DescripcionCodificada', uuid: UUID_ENCODE },
        { pos: posAmount, name: 'Monto',                 uuid: UUID_ASK_AMOUNT }
      ]));

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict>'
    + '<key>WFWorkflowClientVersion</key><string>1146.7</string>'
    + '<key>WFWorkflowMinimumClientVersion</key><integer>900</integer>'
    + '<key>WFWorkflowMinimumClientVersionString</key><string>900</string>'
    + '<key>WFWorkflowIcon</key><dict>'
    + '<key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>'
    + '<key>WFWorkflowIconStartColor</key><integer>463140863</integer>'
    + '</dict>'
    + '<key>WFWorkflowImportQuestions</key><array/>'
    + '<key>WFWorkflowInputContentItemClasses</key><array/>'
    + '<key>WFWorkflowTypes</key><array/>'
    + '<key>WFWorkflowActions</key><array>'
    + askDesc + encodeDesc + askAmount + openUrl
    + '</array>'
    + '</dict></plist>\n';
}
```

Agregar `buildShortcutPlist` al objeto `_quickaddAPI`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/quickadd.js test/quickadd.test.js
git commit -m "feat(quickadd): generate unsigned .shortcut plist"
```

---

## Task 3: Capa de datos — categoría `Apple Pay` y cuenta configurable

**Files:**
- Modify: `src/modules/db.js:41-58` (objeto `settings` de `emptyDB`)
- Modify: `src/modules/categorias.js:4-15` (`DEFAULT_CATS`) y su bloque de exports
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `db.settings.applePayAccount: string` en bases nuevas.
  - `MF.categorias.DEFAULT_CATS` — array de `{name, color, icon}`, ahora público. Lo consume Task 4.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test/db.test.js`, dentro del `describe('emptyDB', ...)` que ya existe
en la línea 36 (el archivo importa el módulo como `db`, no por destructuring):

```js
  test('incluye applePayAccount vacío en settings', () => {
    assert.equal(db.emptyDB().settings.applePayAccount, '');
  });
```

Crear `test/categorias.test.js`:

```js
// test/categorias.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const { DEFAULT_CATS, getCatColor } = require('../src/modules/categorias');

describe('DEFAULT_CATS', () => {
  test('se exporta como array no vacío', () => {
    assert.ok(Array.isArray(DEFAULT_CATS));
    assert.ok(DEFAULT_CATS.length > 0);
  });

  test('incluye la categoría Apple Pay', () => {
    const cat = DEFAULT_CATS.find(c => c.name === 'Apple Pay');
    assert.ok(cat, 'falta la categoría Apple Pay');
    assert.equal(typeof cat.color, 'string');
    assert.equal(typeof cat.icon, 'string');
  });

  test('cada categoría tiene name, color e icon', () => {
    for (const c of DEFAULT_CATS) {
      assert.equal(typeof c.name, 'string');
      assert.ok(c.name.length > 0);
      assert.match(c.color, /^#[0-9a-f]{6}$/i);
      assert.ok(c.icon.length > 0);
    }
  });

  test('no hay nombres duplicados', () => {
    const nombres = DEFAULT_CATS.map(c => c.name);
    assert.equal(new Set(nombres).size, nombres.length);
  });

  test('getCatColor resuelve el color de Apple Pay', () => {
    assert.equal(getCatColor('Apple Pay', { categories: [] }), '#a9b1d6');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test`
Expected: FAIL — `applePayAccount` es `undefined` y `DEFAULT_CATS` no está exportado.

- [ ] **Step 3: Agregar el campo a la DB vacía**

En `src/modules/db.js`, dentro de `settings` en `emptyDB()` (después de `budgetRollover: false,`):

```js
      budgetRollover: false,
      applePayAccount: '',
```

No se toca `migrateV1toV2` ni se sube la versión del esquema: el campo se lee siempre con `??`, así que las bases v2 existentes siguen siendo válidas.

- [ ] **Step 4: Agregar la categoría y exportar la lista**

En `src/modules/categorias.js`, agregar a `DEFAULT_CATS` antes de `'Otro'`:

```js
  { name: 'Apple Pay',        color: '#a9b1d6', icon: 'coins' },
```

Y en el objeto de exports de la última línea:

```js
var _catAPI = { render: render, getCatColor: getCatColor, DEFAULT_CATS: DEFAULT_CATS };
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/db.js src/modules/categorias.js test/db.test.js test/categorias.test.js
git commit -m "feat(quickadd): add Apple Pay category and configurable account"
```

---

## Task 4: Prefill, campo `source` y badge en `gastos.js`

**Files:**
- Modify: `src/modules/gastos.js:129-147` (badge en `_renderList`)
- Modify: `src/modules/gastos.js:164-209` (`_openAddModal` acepta prefill)
- Modify: `src/modules/gastos.js:211-238` (`_saveTx` persiste `source`)
- Modify: `src/modules/gastos.js:260` (exports)

**Interfaces:**
- Consumes: `MF.categorias.DEFAULT_CATS` de Task 3.
- Produces: `MF.gastos.openAddModal(id: string|null, prefill?: object)`. El prefill acepta `{desc, amount, cat, account, type, date, note, source, modalTitle}`. Lo consume Task 5.

- [ ] **Step 1: Reemplazar `_openAddModal` completo**

Sustituir el cuerpo de `_openAddModal` (líneas 164-209) por:

```js
function _openAddModal(id, prefill) {
  _db = MF.db.loadData();
  const tx  = id ? _db.transactions.find(t => t.id === id) : null;
  // `base` unifica los tres orígenes de valores: edición, prefill externo y vacío.
  const base = tx || prefill || {};

  const accOptions = _db.accounts.map(a =>
    '<option value="' + MF.nav.esc(a.id) + '"' + (base.account === a.id ? ' selected' : '') + '>'
    + MF.nav.esc(a.name) + '</option>'
  ).join('');

  const today       = new Date().toISOString().slice(0, 10);
  const defaultCats = (MF.categorias.DEFAULT_CATS || []).map(c => c.name);
  const customCats  = (_db.categories || []).filter(c => !c.hidden).map(c => c.name);
  const allCats     = defaultCats.concat(customCats.filter(c => !defaultCats.includes(c)));

  const catOptions = allCats.map(c =>
    '<option value="' + MF.nav.esc(c) + '"' + (base.cat === c ? ' selected' : '') + '>' + MF.nav.esc(c) + '</option>'
  ).join('');

  const type = base.type || 'expense';

  const formHTML = '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Tipo</label>'
    + '<select class="form-select" id="tx-type">'
    + '<option value="expense"' + (type === 'expense' ? ' selected' : '') + '>Gasto</option>'
    + '<option value="income"'  + (type === 'income'  ? ' selected' : '') + '>Ingreso</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">Fecha</label>'
    + '<input class="form-input" id="tx-date" type="date" value="' + MF.nav.esc(base.date || today) + '"></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Descripción</label>'
    + '<input class="form-input" id="tx-desc" value="' + MF.nav.esc(base.desc || '') + '" placeholder="ej: Supermercado"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Monto</label>'
    + '<input class="form-input" id="tx-amount" type="number" step="0.01" min="0" value="'
    + (base.amount != null ? Number(base.amount) : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Categoría</label>'
    + '<select class="form-select" id="tx-cat">' + catOptions + '</select></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Cuenta</label>'
    + '<select class="form-select" id="tx-account">' + accOptions + '</select></div>'
    + '<div class="form-group"><label class="form-label">Nota (opcional)</label>'
    + '<textarea class="form-textarea" id="tx-note" rows="2" placeholder="Detalles adicionales…">'
    + MF.nav.esc(base.note || '') + '</textarea></div>'
    + '<input type="hidden" id="tx-source" value="' + MF.nav.esc(base.source || '') + '">';

  const title = tx ? 'Editar transacción' : (base.modalTitle || 'Nueva transacción');

  MF.nav.showModal(formHTML, title, [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: tx ? 'Guardar' : 'Agregar', primary: true, action: () => _saveTx(id) }
  ]);
}
```

`base.amount` pasa por `Number()` y no por `esc()` porque se interpola en un
atributo numérico; `esc()` no aplica a valores no textuales. El resto de campos
sí van escapados — `base.desc` puede venir de la URL.

- [ ] **Step 2: Persistir `source` en `_saveTx`**

En `_saveTx`, después de la lectura de `note` (línea 218):

```js
  const source  = ((document.getElementById('tx-source') || {}).value || '').trim();
```

Y en las dos ramas de guardado:

```js
  if (id) {
    const idx = db.transactions.findIndex(t => t.id === id);
    if (idx >= 0) db.transactions[idx] = { ...db.transactions[idx], desc, amount, date, type, cat, account, note, source, updatedAt: now };
  } else {
    db.transactions.push({ id: MF.db.generateId(), desc, amount, date, type, cat, account, note, source, createdAt: now, updatedAt: now });
  }
```

El hidden se pre-llena desde `base.source`, así que editar una transacción de
Apple Pay conserva su origen en vez de borrarlo.

- [ ] **Step 3: Mostrar el badge de origen en la lista**

Agregar antes de `function _renderList()` (línea 89):

```js
const SOURCE_LABELS = { applepay: 'Apple Pay' };

function _sourceLabel(src) { return SOURCE_LABELS[src] || src; }
```

Dentro del `txs.forEach` de `_renderList`, junto a `noteLabel` (línea 134):

```js
        const srcBadge  = tx.source
          ? ' <span style="display:inline-block;padding:1px 6px;border-radius:6px;'
            + 'background:var(--bg3);color:var(--text3);font-size:10px;vertical-align:middle">'
            + MF.nav.esc(_sourceLabel(tx.source)) + '</span>'
          : '';
```

Y añadirlo a la línea de subtítulo:

```js
          + '<div class="list-item__sub">' + MF.nav.esc(tx.cat || 'Sin categoría') + accName + noteLabel + srcBadge + '</div>'
```

- [ ] **Step 4: Exportar `openAddModal`**

Cambiar la línea 260:

```js
const _gastosAPI = { render, openAddModal: _openAddModal };
```

- [ ] **Step 5: Correr los tests y el build**

Run: `npm test && npm run build`
Expected: PASS y build exitoso. Los tests existentes no cubren `gastos.js`, así
que aquí la red de seguridad es el build más la verificación manual del paso 6.

- [ ] **Step 6: Verificar manualmente el modal**

Abrir `dist/index.html` en el navegador, ir a Gastos, pulsar `+`. Comprobar:
la categoría **Apple Pay** aparece en el desplegable, el formulario abre vacío
como antes, y guardar una transacción sigue funcionando.

- [ ] **Step 7: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/gastos.js
git commit -m "feat(gastos): support prefilled modal and transaction source"
```

---

## Task 5: Router y `consume()`

**Files:**
- Modify: `src/modules/nav.js:39-48` (`init`)
- Modify: `src/modules/nav.js:78-97` (`_initRouter`)
- Modify: `src/modules/quickadd.js` (agregar `consume`)

**Interfaces:**
- Consumes: `parseIntent`, `isQuickAddHash`, `resolveAccount`, `DEFAULT_CAT` (Task 1); `MF.categorias.DEFAULT_CATS` (Task 3); `MF.gastos.openAddModal` (Task 4).
- Produces: `MF.quickadd.consume() => boolean` — `true` si abrió el modal con el intent.

- [ ] **Step 1: Hacer el router tolerante al query string**

En `src/modules/nav.js`, agregar antes de `_initRouter` (línea 78):

```js
// El hash puede traer un query string ('#quick-add?desc=…'); la sección es
// solo el segmento previo al '?'.
function _sectionFromHash() {
  const raw  = location.hash.slice(1);
  const qIdx = raw.indexOf('?');
  return (qIdx >= 0 ? raw.slice(0, qIdx) : raw) || 'dashboard';
}
```

Reemplazar las dos lecturas del hash dentro de `_initRouter`:

```js
  window.addEventListener('hashchange', () => {
    _showSection(_sectionFromHash());
    closeDrawer();
  });
```

y

```js
  _showSection(_sectionFromHash());
```

- [ ] **Step 2: Disparar `consume()` al final de `init()`**

En `init()` (línea 39), agregar como última llamada:

```js
function init() {
  _initTheme();
  _initRouter();
  _initFab();
  _initDrawer();
  _initModal();
  _initGlobalKeys();
  _checkReminderBanner();
  _applySystemNotificationOnLoad();
  // Va al final: necesita el router montado y puede abrir un modal encima.
  window.MF?.quickadd?.consume?.();
}
```

- [ ] **Step 3: Implementar `consume` en `quickadd.js`**

Insertar antes del bloque de exports:

```js
// ── consume ────────────────────────────────────────────────────────────────
// Lee el intent del hash, lo neutraliza y abre el modal de confirmación.

function consume() {
  if (!isQuickAddHash(location.hash)) return false;

  const intent = parseIntent(location.hash);

  // Limpiar el hash ANTES de cualquier otra cosa: si el usuario recarga la
  // página, el intent no debe volver a dispararse y duplicar el gasto.
  history.replaceState(null, '', location.pathname + location.search);

  const db = MF.db.loadData();

  if (!(db.accounts || []).length) {
    MF.nav.toast('Crea una cuenta primero', 'error');
    MF.nav.go('cuentas');
    return false;
  }

  // El atajo apuntaba aquí pero mandó datos inválidos: se avisa y se abre el
  // modal vacío, para que el gasto se pueda registrar a mano sin reintentar.
  if (!intent) {
    MF.nav.toast('Datos incompletos en el enlace', 'error');
    MF.gastos.openAddModal(null, { account: resolveAccount(db), type: 'expense' });
    return false;
  }

  MF.gastos.openAddModal(null, {
    desc:       intent.desc,
    amount:     intent.amount,
    cat:        _knownCat(intent.cat, db),
    source:     intent.src,
    account:    resolveAccount(db),
    type:       'expense',
    date:       new Date().toISOString().slice(0, 10),
    modalTitle: 'Gasto desde Apple Pay'
  });

  return true;
}

// Una categoría que no existe en la app no puede preseleccionarse: el <select>
// mostraría la primera de la lista en vez del default. Se resuelve aquí.
function _knownCat(cat, db) {
  const known = ((MF.categorias && MF.categorias.DEFAULT_CATS) || []).map(c => c.name)
    .concat((db.categories || []).map(c => c.name));
  return known.includes(cat) ? cat : DEFAULT_CAT;
}
```

Agregar `consume` al objeto `_quickaddAPI`.

- [ ] **Step 4: Correr tests y build**

Run: `npm test && npm run build`
Expected: PASS y build exitoso.

- [ ] **Step 5: Verificar el flujo end-to-end en el navegador**

Servir `dist/` por HTTP — no abrir con `file://`, porque `history.replaceState`
lanza `SecurityError` en ese protocolo:

```bash
node -e "const h=require('http'),f=require('fs');h.createServer((q,s)=>{s.end(f.readFileSync('dist/index.html'))}).listen(8080)"
```

Cargar datos de prueba desde Configuración, y luego navegar a:

```
http://localhost:8080/#quick-add?desc=Caf%C3%A9%20%26%20Pan&amount=4.75
```

Comprobar:
1. Abre el modal titulado "Gasto desde Apple Pay".
2. Descripción muestra `Café & Pan` como texto, no como HTML.
3. Monto `4.75`, categoría `Apple Pay`, fecha de hoy, tipo `Gasto`.
4. La barra de direcciones ya no tiene el hash.
5. Al guardar, la transacción aparece en Gastos con el badge "Apple Pay".
6. Recargar la página no vuelve a abrir el modal.

Probar también estos tres casos:

- **XSS:** `#quick-add?desc=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&amount=1`
  muestra el texto literal en el campo, sin ejecutar nada.
- **Intent inválido:** `#quick-add?desc=Cafe&amount=0` muestra el toast
  "Datos incompletos en el enlace" y abre el modal vacío.
- **Categoría desconocida:** `#quick-add?desc=Cafe&amount=2&cat=Inventada`
  preselecciona **Apple Pay**, no la primera categoría de la lista.

- [ ] **Step 6: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/nav.js src/modules/quickadd.js
git commit -m "feat(quickadd): wire URL intent into the transaction modal"
```

---

## Task 6: Card de instalación en Configuración

**Files:**
- Modify: `src/modules/configuracion.js:71` (slot antes de la card de Info)
- Modify: `src/modules/configuracion.js:85` (llamada al render de la card)
- Modify: `src/modules/quickadd.js` (agregar `downloadShortcut` y `renderInstallCard`)

**Interfaces:**
- Consumes: `isIOS`, `buildShortcutPlist` (Tasks 1-2).
- Produces: `MF.quickadd.renderInstallCard(slot: HTMLElement)`, `MF.quickadd.downloadShortcut()`.

- [ ] **Step 1: Reservar el slot en Configuración**

En `src/modules/configuracion.js`, insertar antes de la card de Info
(`+ '<div class="card">'` en la línea 71):

```js
    + '<div id="quickadd-slot"></div>'
```

Y después de `container.insertAdjacentHTML('beforeend', viewHTML);` (línea 85):

```js
  window.MF?.quickadd?.renderInstallCard?.(document.getElementById('quickadd-slot'));
```

`configuracion.js` solo reserva el espacio; `quickadd` es dueño de su propia UI
y decide si se muestra.

- [ ] **Step 2: Implementar la descarga y la card**

En `src/modules/quickadd.js`, antes del bloque de exports:

```js
// ── Descarga del atajo ─────────────────────────────────────────────────────

// La URL del atajo se deriva de dónde está servida la app, no se hardcodea:
// así el atajo generado desde GitHub Pages apunta a GitHub Pages, y el generado
// desde una copia local apunta a esa copia.
function shortcutBaseUrl() {
  return location.origin + _normalizePath(location.pathname);
}

// Bajo un subdirectorio ('/finanzas'), GitHub Pages responde un 301 hacia
// '/finanzas/'. Un atajo que apunte a la forma sin barra depende de que el
// fragmento sobreviva esa redirección; añadirla evita el riesgo.
function _normalizePath(pathname) {
  const path = pathname || '/';
  if (path.endsWith('/')) return path;
  if (/\/[^/]+\.[a-z0-9]+$/i.test(path)) return path; // apunta a un archivo
  return path + '/';
}

function downloadShortcut() {
  const plist = buildShortcutPlist(shortcutBaseUrl());
  const blob  = new Blob([plist], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = 'MisFinanzas.shortcut';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Card de instalación ────────────────────────────────────────────────────

const _PASOS = [
  'Abre la app Atajos y pulsa + para crear uno nuevo.',
  'Agrega la acción <strong>Pedir entrada</strong> con tipo Texto y la pregunta «¿En qué gastaste?».',
  'Agrega otra <strong>Pedir entrada</strong> con tipo Número y la pregunta «¿Cuánto?».',
  'Agrega <strong>Abrir URL</strong> y pega la URL base; sustituye <code>DESC</code> por la primera respuesta y <code>MONTO</code> por la segunda.',
  'En la pestaña Automatización, crea una automatización personal <strong>App → Wallet → Se cierra</strong> que ejecute este atajo, con «Ejecutar inmediatamente» activado.'
];

function renderInstallCard(slot) {
  if (!slot) return;
  if (!isIOS(navigator)) return;

  const db       = MF.db.loadData();
  const accounts = db.accounts || [];
  const current  = (db.settings && db.settings.applePayAccount) || '';

  const accOptions = accounts.length
    ? accounts.map(a =>
        '<option value="' + MF.nav.esc(a.id) + '"' + (current === a.id ? ' selected' : '') + '>'
        + MF.nav.esc(a.name) + '</option>').join('')
    : '<option value="">Sin cuentas</option>';

  const standalone = window.matchMedia
    && window.matchMedia('(display-mode: standalone)').matches;

  const aviso = standalone
    ? '<p style="font-size:11px;color:var(--text3);margin-top:12px;line-height:1.5">'
      + MF.icons.warning + ' Estás usando la app instalada. Los enlaces que abre Atajos van a Safari, '
      + 'que guarda los datos por separado. Activa <strong>Ajustes → Apps → Safari → Abrir enlaces en app web</strong> '
      + '(iOS 18.4 o superior) para que el gasto llegue aquí.</p>'
    : '';

  const pasosHTML = _PASOS.map(p => '<li style="margin-bottom:6px">' + p + '</li>').join('');

  const html = '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:8px">Registro rápido desde iOS</h3>'
    + '<p style="font-size:13px;color:var(--text2);margin-bottom:16px">'
    + 'Un atajo que registra el gasto justo después de pagar con Apple Pay.</p>'
    + '<div class="form-group"><label class="form-label">Cuenta destino</label>'
    + '<select class="form-select" id="quickadd-account"' + (accounts.length ? '' : ' disabled') + '>'
    + accOptions + '</select></div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">'
    + '<button class="btn btn-primary" id="btn-download-shortcut">Descargar atajo (.shortcut)</button>'
    + '<button class="btn" id="btn-copy-quickadd-url">Copiar URL base</button>'
    + '</div>'
    + '<p style="font-size:11px;color:var(--text3);margin-top:12px;line-height:1.5">'
    + 'Para importarlo necesitas <strong>Ajustes → Atajos → Permitir atajos no confiables</strong>. '
    + 'Ese ajuste solo aparece después de haber ejecutado algún atajo al menos una vez.</p>'
    + aviso
    + '<details style="margin-top:12px">'
    + '<summary style="cursor:pointer;font-size:13px;color:var(--accent)">Crearlo a mano</summary>'
    + '<ol style="font-size:12px;color:var(--text2);margin:12px 0 0 18px;line-height:1.5">'
    + pasosHTML + '</ol></details>'
    + '</div>';

  slot.textContent = '';
  slot.insertAdjacentHTML('beforeend', html);

  document.getElementById('quickadd-account')?.addEventListener('change', e => {
    const db2 = MF.db.loadData();
    db2.settings.applePayAccount = e.target.value;
    MF.db.saveData(db2);
    MF.nav.toast('Cuenta guardada');
  });

  document.getElementById('btn-download-shortcut')?.addEventListener('click', () => {
    downloadShortcut();
    MF.nav.toast('Atajo descargado');
  });

  document.getElementById('btn-copy-quickadd-url')?.addEventListener('click', () => {
    const url = shortcutBaseUrl() + '#' + QUICKADD_SECTION
              + '?desc=DESC&amount=MONTO&src=' + DEFAULT_SOURCE;
    navigator.clipboard?.writeText(url)
      .then(() => MF.nav.toast('URL copiada'))
      .catch(() => MF.nav.toast('No se pudo copiar', 'error'));
  });
}
```

Los strings de `_PASOS` son texto estático del propio código, no datos de
usuario, así que llevan HTML a propósito y no pasan por `esc()`. Los nombres de
cuenta sí van escapados.

Agregar `renderInstallCard`, `downloadShortcut`, `shortcutBaseUrl` y
`buildShortcutPlist` al objeto `_quickaddAPI`.

- [ ] **Step 3: Correr tests y build**

Run: `npm test && npm run build`
Expected: PASS y build exitoso.

- [ ] **Step 4: Verificar en el navegador**

Abrir `dist/index.html` en un navegador de escritorio, ir a Configuración:
la card **no** debe aparecer. Luego abrir las DevTools, activar la emulación de
dispositivo iPhone (que cambia el user agent) y recargar: la card aparece,
el selector de cuenta persiste al recargar, y "Descargar atajo" produce un
archivo `MisFinanzas.shortcut`.

Abrir el archivo descargado en un editor de texto y confirmar que es XML
legible con las cuatro acciones.

- [ ] **Step 5: Commit** *(solo con autorización explícita del usuario)*

```bash
git add src/modules/quickadd.js src/modules/configuracion.js
git commit -m "feat(quickadd): add iOS-only shortcut install card in settings"
```

---

## Task 7: Verificación final

**Files:**
- Modify: `README.md` (sección de características)

- [ ] **Step 1: Correr la suite completa**

Run: `npm test`
Expected: PASS, todos los archivos de test.

- [ ] **Step 2: Build limpio**

Run: `npm run build`
Expected: `Done! dist/index.html — <tamaño> KB`

- [ ] **Step 3: Documentar la característica**

En `README.md`, bajo "💰 Gestión de Transacciones", agregar:

```markdown
- **Registro rápido desde iOS** - atajo que captura el gasto tras pagar con Apple Pay
```

- [ ] **Step 4: Commit** *(solo con autorización explícita del usuario)*

```bash
git add README.md
git commit -m "docs: document iOS quick-add shortcut"
```

---

## Verificación pendiente en dispositivo

Estas dos cosas no son verificables desde el entorno de desarrollo y quedan
para prueba en un iPhone real:

1. **Que iOS importe el `.shortcut` generado.** El plist va sin firmar. Si la
   importación falla, el camino de respaldo son los pasos manuales de la card,
   que ya cubren el flujo completo.
2. **Que el trigger de automatización dispare al momento correcto.** La
   automatización "App → Wallet → Se cierra" es la aproximación práctica al
   evento de pago fuera de Estados Unidos.
