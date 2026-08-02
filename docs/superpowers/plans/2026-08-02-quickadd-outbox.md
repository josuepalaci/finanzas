# Outbox del atajo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los gastos registrados por el atajo en Safari viajan a la PWA instalada vía portapapeles, con dedup por UUID.

**Architecture:** La copia de Safari acumula las transacciones del atajo en `db.quickaddOutbox`; un banner permite copiarlas como payload `MFSYNC1:` al portapapeles; la app instalada las pega, valida, asigna cuenta y aplica efectos de saldo. Lógica pura en `quickadd.js` (testeable en Node), DOM en banners.

**Tech Stack:** Vanilla JS, patrón MF namespace + dual-export, `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-02-quickadd-outbox-design.md`

## Global Constraints

- Sin backend; todo local (filosofía del proyecto).
- Todo dato externo (portapapeles) se valida en `parseOutboxPayload` y se renderiza con `MF.nav.esc()`.
- Máx 100 items por payload; `desc` truncada a 120 (`MAX_DESC`).
- Tests con `process.env.TZ = 'America/El_Salvador'` (ya fijado en los archivos de test).
- `quickaddOutbox` NO se agrega a `_COLLECTIONS` de sync.js.
- Prefijo del payload: `MFSYNC1:` exacto.

---

### Task 1: Payload puro — build/parse + emptyDB

**Files:**
- Modify: `src/modules/quickadd.js` (constantes + 2 funciones + exports)
- Modify: `src/modules/db.js` (`quickaddOutbox: []` en `emptyDB()`)
- Test: `test/quickadd.test.js`, `test/db.test.js`

**Interfaces:**
- Produces: `buildOutboxPayload(txs: Tx[]) -> string`; `parseOutboxPayload(str) -> Tx[] | null` (Tx sin `account`); `OUTBOX_PREFIX = 'MFSYNC1:'`; `db.quickaddOutbox` en `emptyDB()`.

- [ ] **Step 1: tests RED**

En `test/db.test.js`, dentro de `describe('emptyDB')`:

```js
  test('incluye quickaddOutbox vacío', () => {
    assert.deepEqual(db.emptyDB().quickaddOutbox, []);
  });
```

En `test/quickadd.test.js` (importar `buildOutboxPayload, parseOutboxPayload` del módulo):

```js
describe('buildOutboxPayload / parseOutboxPayload', () => {
  const tx = { id: 'u1', desc: 'Super', amount: 24.5, cat: 'Apple Pay', date: '2026-08-02',
               note: '', type: 'expense', source: 'applepay', account: 'acc1',
               createdAt: '2026-08-02T20:00:00Z', updatedAt: '2026-08-02T20:00:00Z' };

  test('round-trip: build → parse devuelve las transacciones', () => {
    const out = parseOutboxPayload(buildOutboxPayload([tx]));
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'u1');
    assert.equal(out[0].amount, 24.5);
  });

  test('el payload no incluye la cuenta (los UUID difieren entre copias)', () => {
    assert.ok(!buildOutboxPayload([tx]).includes('acc1'));
    assert.equal(parseOutboxPayload(buildOutboxPayload([tx]))[0].account, undefined);
  });

  test('build limita a los 100 más recientes', () => {
    const txs = Array.from({ length: 120 }, (_, i) => ({ ...tx, id: 'u' + i }));
    const out = parseOutboxPayload(buildOutboxPayload(txs));
    assert.equal(out.length, 100);
    assert.equal(out[0].id, 'u20');
  });

  test('parse rechaza entradas que no son payload', () => {
    assert.equal(parseOutboxPayload(null), null);
    assert.equal(parseOutboxPayload('hola'), null);
    assert.equal(parseOutboxPayload('MFSYNC1:{corrupto'), null);
    assert.equal(parseOutboxPayload('MFSYNC1:{"no":"array"}'), null);
    assert.equal(parseOutboxPayload('MFSYNC1:[]'), null);
  });

  test('parse descarta items inválidos y conserva los válidos', () => {
    const payload = 'MFSYNC1:' + JSON.stringify([
      { ...tx, account: undefined },
      { ...tx, id: '', account: undefined },
      { ...tx, id: 'u2', amount: -5, account: undefined },
      { ...tx, id: 'u3', amount: Infinity, account: undefined },
      { ...tx, id: 'u4', desc: '', account: undefined },
      { ...tx, id: 'u5', type: 'other', account: undefined },
      { ...tx, id: 'u6', date: '02/08/2026', account: undefined },
      'no-objeto'
    ]);
    const out = parseOutboxPayload(payload);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'u1');
  });

  test('parse trunca descripciones a 120', () => {
    const payload = 'MFSYNC1:' + JSON.stringify([{ ...tx, desc: 'x'.repeat(200), account: undefined }]);
    assert.equal(parseOutboxPayload(payload)[0].desc.length, 120);
  });
});
```

- [ ] **Step 2: correr y ver fallar** — `node --test test/quickadd.test.js test/db.test.js` → FAIL (`not a function` / `deepEqual undefined`).

- [ ] **Step 3: implementación mínima**

En `db.js` `emptyDB()`, después de `categories:   [],`:

```js
    quickaddOutbox: [],
```

En `quickadd.js`, tras las constantes existentes (`MAX_DESC`):

```js
// ── Outbox: Safari → portapapeles → PWA instalada ─────────────────────────
// La copia de Safari es un buzón: las transacciones del atajo se acumulan en
// db.quickaddOutbox y viajan a la app instalada por el portapapeles, con
// dedup por UUID en el destino. El payload nunca lleva la cuenta: los UUID de
// cuenta difieren entre copias.
const OUTBOX_PREFIX = 'MFSYNC1:';
const OUTBOX_MAX    = 100;

function buildOutboxPayload(txs) {
  const items = (txs || []).slice(-OUTBOX_MAX).map(t => ({
    id: t.id, desc: t.desc, amount: t.amount, cat: t.cat || '', date: t.date,
    note: t.note || '', type: t.type, source: t.source || '',
    createdAt: t.createdAt || '', updatedAt: t.updatedAt || ''
  }));
  return OUTBOX_PREFIX + JSON.stringify(items);
}

// El portapapeles es entrada no confiable: aquí vive TODA la validación.
function parseOutboxPayload(str) {
  if (typeof str !== 'string' || !str.startsWith(OUTBOX_PREFIX)) return null;
  let arr;
  try { arr = JSON.parse(str.slice(OUTBOX_PREFIX.length)); } catch (_) { return null; }
  if (!Array.isArray(arr)) return null;

  const out = [];
  for (const t of arr.slice(0, OUTBOX_MAX)) {
    if (!t || typeof t !== 'object') continue;
    const id     = typeof t.id === 'string' ? t.id.trim() : '';
    const desc   = typeof t.desc === 'string' ? t.desc.trim().slice(0, MAX_DESC) : '';
    const amount = t.amount;
    const type   = t.type === 'income' || t.type === 'expense' ? t.type : '';
    const date   = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '';
    if (!id || !desc || !Number.isFinite(amount) || amount <= 0 || !type || !date) continue;
    out.push({
      id, desc, amount, type, date,
      cat:       typeof t.cat === 'string' ? t.cat.slice(0, 40) : '',
      note:      typeof t.note === 'string' ? t.note.slice(0, 500) : '',
      source:    typeof t.source === 'string' ? t.source.slice(0, 20) : '',
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : '',
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : ''
    });
  }
  return out.length ? out : null;
}
```

Agregar a `_quickaddAPI`: `buildOutboxPayload, parseOutboxPayload,`.

- [ ] **Step 4: correr y ver pasar** — `node --test test/quickadd.test.js test/db.test.js` → PASS.
- [ ] **Step 5: commit** — `git add -A && git commit -m "feat(outbox): payload MFSYNC1 build/parse + quickaddOutbox en emptyDB"`

---

### Task 2: addToOutbox + importOutboxTxs

**Files:**
- Modify: `src/modules/quickadd.js`
- Test: `test/quickadd.test.js`

**Interfaces:**
- Consumes: `window.MF.db.applyTxEffect(db, null, tx)` (ya existe en db.js).
- Produces: `addToOutbox(db, tx) -> void` (muta `db.quickaddOutbox`, copia sin `account`); `importOutboxTxs(db, txs, accountId) -> {imported, skipped}` (muta db: push + saldo).

- [ ] **Step 1: tests RED**

En `test/quickadd.test.js` el mock global ya expone `window.MF.db`; asegurarse de que incluya el módulo real para efectos:

```js
// junto al require existente de '../src/modules/db'
global.window.MF = global.window.MF || {};
global.window.MF.db = Object.assign(global.window.MF.db || {}, {
  applyTxEffect: require('../src/modules/db').applyTxEffect
});
```

(Si el archivo ya monta `window.MF.db` en cada `setup()`, añadir `applyTxEffect` ahí.)

```js
describe('addToOutbox', () => {
  test('agrega una copia sin cuenta y crea el array si falta', () => {
    const db = {};
    addToOutbox(db, { id: 'u1', desc: 'Super', amount: 10, account: 'acc1', type: 'expense', date: '2026-08-02' });
    assert.equal(db.quickaddOutbox.length, 1);
    assert.equal(db.quickaddOutbox[0].account, undefined);
    assert.equal(db.quickaddOutbox[0].id, 'u1');
  });

  test('recorta el buzón a 100', () => {
    const db = { quickaddOutbox: Array.from({ length: 100 }, (_, i) => ({ id: 'u' + i })) };
    addToOutbox(db, { id: 'nuevo' });
    assert.equal(db.quickaddOutbox.length, 100);
    assert.equal(db.quickaddOutbox[99].id, 'nuevo');
  });
});

describe('importOutboxTxs', () => {
  function baseDB() {
    return {
      accounts: [{ id: 'acc1', name: 'Corriente', balance: 1000 }],
      transactions: []
    };
  }
  const t1 = { id: 'u1', desc: 'Super', amount: 100, cat: 'Apple Pay', date: '2026-08-02',
               note: '', type: 'expense', source: 'applepay', createdAt: 'c', updatedAt: 'c' };

  test('importa asignando cuenta y ajustando el saldo', () => {
    const db = baseDB();
    const res = importOutboxTxs(db, [t1], 'acc1');
    assert.deepEqual(res, { imported: 1, skipped: 0 });
    assert.equal(db.transactions[0].account, 'acc1');
    assert.equal(db.accounts[0].balance, 900);
  });

  test('dedup por id: los existentes se omiten sin tocar el saldo', () => {
    const db = baseDB();
    db.transactions.push({ ...t1, account: 'acc1' });
    const res = importOutboxTxs(db, [t1, { ...t1, id: 'u2' }], 'acc1');
    assert.deepEqual(res, { imported: 1, skipped: 1 });
    assert.equal(db.accounts[0].balance, 900);
    assert.equal(db.transactions.length, 2);
  });

  test('ids repetidos dentro del mismo payload solo importan una vez', () => {
    const db = baseDB();
    const res = importOutboxTxs(db, [t1, t1], 'acc1');
    assert.deepEqual(res, { imported: 1, skipped: 1 });
  });
});
```

- [ ] **Step 2: correr y ver fallar** — `node --test test/quickadd.test.js` → FAIL.

- [ ] **Step 3: implementación**

```js
function addToOutbox(db, tx) {
  if (!db || !tx) return;
  db.quickaddOutbox = db.quickaddOutbox || [];
  const copia = { ...tx };
  delete copia.account;
  db.quickaddOutbox.push(copia);
  if (db.quickaddOutbox.length > OUTBOX_MAX) {
    db.quickaddOutbox = db.quickaddOutbox.slice(-OUTBOX_MAX);
  }
}

function importOutboxTxs(db, txs, accountId) {
  let imported = 0;
  let skipped  = 0;
  const existing = new Set((db.transactions || []).map(t => t.id));
  const now = new Date().toISOString();

  for (const t of (txs || [])) {
    if (existing.has(t.id)) { skipped++; continue; }
    const tx = { ...t, account: accountId || '',
                 createdAt: t.createdAt || now, updatedAt: t.updatedAt || now };
    window.MF.db.applyTxEffect(db, null, tx);
    db.transactions.push(tx);
    existing.add(tx.id);
    imported++;
  }
  return { imported, skipped };
}
```

Exportar ambas en `_quickaddAPI`.

- [ ] **Step 4: correr y ver pasar** — PASS.
- [ ] **Step 5: commit** — `git commit -m "feat(outbox): addToOutbox e importOutboxTxs con dedup y efecto de saldo"`

---

### Task 3: Trigger en gastos._saveTx

**Files:**
- Modify: `src/modules/gastos.js` (dentro de `_saveTx`, rama de creación)

**Interfaces:**
- Consumes: `MF.quickadd.addToOutbox(db, tx)`, `MF.pwa.isInstalled()`.

- [ ] **Step 1: implementar** — en `_saveTx`, rama `else` (creación), después de `db.transactions.push(newTx);`:

```js
    // Vía atajo fuera de la app instalada: la copia de Safari es un buzón; la
    // tx se encola para pasarla a la app instalada por el portapapeles.
    if (source && !(window.MF.pwa && window.MF.pwa.isInstalled())) {
      MF.quickadd.addToOutbox(db, newTx);
    }
```

(Solo creaciones: las ediciones no re-encolan. Los recurrentes no llevan `source`, no encolan.)

- [ ] **Step 2: suite completa verde** — `npm test` → PASS (sin tests nuevos: DOM handler; la lógica encolada ya está testeada en Task 2).
- [ ] **Step 3: commit** — `git commit -m "feat(outbox): encolar transacciones del atajo fuera de la app instalada"`

---

### Task 4: Banners + clipboard (copiar en Safari, pegar en instalada)

**Files:**
- Modify: `src/modules/quickadd.js` (render de banners + `copyOutbox` + `syncFromClipboard` + `updateBanners` + `initBanners`)
- Modify: `src/index.html` (slot `<div id="quickadd-banner-slot"></div>` inmediatamente después del div `reminder-banner`)
- Modify: `src/modules/nav.js` (`_showSection`: llamar `window.MF.quickadd?.updateBanners?.();` justo después de `window.MF[section]?.render?.();`; `init()`: llamar `window.MF.quickadd?.initBanners?.();` al final)
- Test: `test/quickadd.test.js` (banners con fakeSlot, patrón de `renderInstallCard`)

**Interfaces:**
- Consumes: `buildOutboxPayload`, `parseOutboxPayload`, `importOutboxTxs`, `resolveAccount(db)` (existente), `MF.pwa.isInstalled()`, `MF.nav.{toast,go,refresh,esc}`.
- Produces: `renderOutboxBanner(slot)`, `renderSyncBanner(slot)`, `copyOutbox()`, `syncFromClipboard() -> Promise`, `updateBanners()`, `initBanners()`.

- [ ] **Step 1: tests RED** (mismo fakeSlot/mocks del describe de `renderInstallCard`; mockear `window.MF.pwa.isInstalled`)

```js
describe('renderOutboxBanner', () => {
  test('sin items no renderiza nada', () => {
    // setup con isInstalled=false y loadData → { quickaddOutbox: [] }
    const slot = fakeSlot();
    renderOutboxBanner(slot);
    assert.equal(slot.html, '');
  });

  test('en la app instalada no renderiza aunque haya items', () => {
    // setup con isInstalled=true y outbox con 2 items
    const slot = fakeSlot();
    renderOutboxBanner(slot);
    assert.equal(slot.html, '');
  });

  test('con items muestra conteo, Copiar y Vaciar', () => {
    // setup con isInstalled=false y outbox con 2 items
    const slot = fakeSlot();
    renderOutboxBanner(slot);
    assert.ok(slot.html.includes('2 gastos'));
    assert.ok(slot.html.includes('btn-outbox-copy'));
    assert.ok(slot.html.includes('btn-outbox-clear'));
  });

  test('la descripción del gasto no se interpola sin esc', () => {
    // item con desc '<img src=x>' → el html no debe contener la etiqueta cruda
    const slot = fakeSlot();
    renderOutboxBanner(slot);
    assert.ok(!slot.html.includes('<img'));
  });
});

describe('renderSyncBanner', () => {
  test('solo aparece en la app instalada', () => {
    // isInstalled=false → vacío; isInstalled=true → contiene btn-sync-paste
  });
});
```

(El html del outbox banner solo interpola el conteo — número — y texto fijo; el test de esc protege contra regresiones si alguien añade la desc.)

- [ ] **Step 2: correr y ver fallar.**

- [ ] **Step 3: implementación**

```js
function _standalone() {
  return !!(typeof window !== 'undefined' && window.MF && window.MF.pwa && window.MF.pwa.isInstalled());
}

// Banner en la copia auxiliar (Safari): ofrece copiar el buzón.
function renderOutboxBanner(slot) {
  if (!slot) return;
  slot.textContent = '';
  if (_standalone()) return;
  const db = MF.db.loadData();
  const n  = (db.quickaddOutbox || []).length;
  if (!n) return;

  slot.insertAdjacentHTML('beforeend',
    '<div class="reminder-banner active" id="outbox-banner">'
    + MF.icons.transferencias + ' ' + n + ' gasto' + (n !== 1 ? 's' : '')
    + ' del atajo para tu app instalada'
    + '<button class="btn-link" id="btn-outbox-copy">Copiar</button>'
    + '<button class="btn-icon" id="btn-outbox-clear" style="margin-left:auto" aria-label="Vaciar">' + MF.icons.x + '</button>'
    + '</div>');

  document.getElementById('btn-outbox-copy')?.addEventListener('click', copyOutbox);
  document.getElementById('btn-outbox-clear')?.addEventListener('click', () => {
    MF.nav.showModal(
      '<p style="color:var(--text2)">¿Vaciar el buzón del atajo? Si aún no pegaste estos gastos en tu app instalada, se perderán de este canal (siguen guardados en esta copia).</p>',
      'Vaciar buzón', [
        { label: 'Cancelar', action: MF.nav.closeModal },
        { label: 'Vaciar', danger: true, action: () => {
          const db2 = MF.db.loadData();
          db2.quickaddOutbox = [];
          MF.db.saveData(db2);
          MF.nav.closeModal();
          updateBanners();
        }}
      ]);
  });
}

function copyOutbox() {
  const db = MF.db.loadData();
  const payload = buildOutboxPayload(db.quickaddOutbox || []);
  navigator.clipboard.writeText(payload)
    .then(() => MF.nav.toast('Copiados. Abre tu app instalada y toca Pegar.'))
    .catch(() => MF.nav.toast('No se pudo copiar', 'error'));
}

// Banner en la app instalada: ofrece pegar/sincronizar. Descartable, 15 s.
let _syncBannerTimer = null;

function renderSyncBanner(slot) {
  if (!slot) return;
  slot.textContent = '';
  if (!_standalone()) return;

  slot.insertAdjacentHTML('beforeend',
    '<div class="reminder-banner active" id="sync-banner">'
    + MF.icons.transferencias + ' ¿Sincronizar gastos del atajo?'
    + '<button class="btn-link" id="btn-sync-paste">Pegar</button>'
    + '<button class="btn-icon" id="btn-sync-dismiss" style="margin-left:auto" aria-label="Cerrar">' + MF.icons.x + '</button>'
    + '</div>');

  document.getElementById('btn-sync-paste')?.addEventListener('click', () => { syncFromClipboard(); });
  document.getElementById('btn-sync-dismiss')?.addEventListener('click', () => { slot.textContent = ''; });

  clearTimeout(_syncBannerTimer);
  _syncBannerTimer = setTimeout(() => { slot.textContent = ''; }, 15000);
}

async function syncFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch (_) {
    MF.nav.toast('No se pudo leer el portapapeles', 'error');
    return;
  }

  const txs = parseOutboxPayload(text);
  if (!txs) {
    MF.nav.toast('No hay gastos del atajo en el portapapeles', 'info');
    document.getElementById('quickadd-banner-slot')?.replaceChildren();
    return;
  }

  const db = MF.db.loadData();
  if (!(db.accounts || []).length) {
    MF.nav.toast('Crea una cuenta primero', 'error');
    MF.nav.go('cuentas');
    return;
  }

  const res = importOutboxTxs(db, txs, resolveAccount(db));
  MF.db.saveData(db);
  try { await navigator.clipboard.writeText(''); } catch (_) {}
  MF.nav.toast(res.imported + ' importado' + (res.imported !== 1 ? 's' : '')
    + ', ' + res.skipped + ' ya existía' + (res.skipped !== 1 ? 'n' : ''));
  document.getElementById('quickadd-banner-slot')?.replaceChildren();
  MF.nav.refresh();
}

// Llamado por nav en cada _showSection: refresca el banner del buzón (Safari).
function updateBanners() {
  renderOutboxBanner(document.getElementById('quickadd-banner-slot'));
}

// Llamado por nav.init: banner de sincronización al abrir y al volver al frente.
function initBanners() {
  if (!_standalone()) { updateBanners(); return; }
  const slot = document.getElementById('quickadd-banner-slot');
  renderSyncBanner(slot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderSyncBanner(slot);
  });
}
```

Exportar en `_quickaddAPI`: `renderOutboxBanner, renderSyncBanner, copyOutbox, syncFromClipboard, updateBanners, initBanners`.

En `src/index.html`, tras el cierre `</div>` del `reminder-banner`:

```html
    <!-- Outbox del atajo (Safari) / sincronización (app instalada) -->
    <div id="quickadd-banner-slot"></div>
```

En `nav.js` `_showSection`, después de `window.MF[section]?.render?.();`:

```js
  window.MF.quickadd?.updateBanners?.();
```

En `nav.js` `init()`, al final:

```js
  window.MF.quickadd?.initBanners?.();
```

- [ ] **Step 4: suite completa** — `npm test` → PASS.
- [ ] **Step 5: commit** — `git commit -m "feat(outbox): banners de copiar (Safari) y pegar (instalada) vía portapapeles"`

---

### Task 5: Build, verificación y docs

**Files:**
- Modify: `CLAUDE.md` (sección Quick add: describir el outbox en 2-3 líneas)
- Modify: `docs/superpowers/specs/2026-08-02-quickadd-outbox-design.md` (Estado: Implementado)

- [ ] **Step 1:** `npm test` → todo verde; `node build.js` → OK.
- [ ] **Step 2:** extraer el `<script>` de `dist/index.html` y `node --check` → parsea.
- [ ] **Step 3:** en CLAUDE.md, en la sección "Quick add desde iOS", añadir:

```markdown
El **outbox** cubre la partición de almacenamiento Safari/PWA instalada: las tx del atajo se acumulan en `db.quickaddOutbox` (solo fuera de standalone), un banner las copia como `MFSYNC1:` + JSON al portapapeles, y la app instalada las importa con dedup por UUID (`parseOutboxPayload`/`importOutboxTxs`) asignándolas a la cuenta configurada.
```

- [ ] **Step 4: commit + push** — `git commit -m "feat(outbox): sincronización Safari → app instalada vía portapapeles" && git push` (el push a master dispara el deploy).
- [ ] **Step 5:** verificar el deploy (`gh api` o curl al workflow) y probar en el teléfono: atajo → Safari → Copiar → abrir PWA → Pegar.
