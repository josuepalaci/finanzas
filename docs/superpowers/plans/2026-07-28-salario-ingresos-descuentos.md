# Ingresos y descuentos adicionales en `/#salario` — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la calculadora salarial acepte horas extra, días feriados, días no trabajados y listas libres de otros ingresos y descuentos, calculando el neto como lo haría una planilla salvadoreña real.

**Architecture:** Se extrae la lógica de cálculo de `salario.js` a funciones puras exportables y testeables (`normalizarCfg`, `calcBaseHoraria`, `calcAjustes`, `calcRelacion`). La UI pasa a leer un objeto de configuración del DOM, calcular con esas funciones y persistir en `db.settings.salario`. Las filas de las listas se construyen con la API del DOM para no romper el invariante de seguridad del módulo.

**Tech Stack:** JavaScript vanilla ES5-style (`var` / `function`, el estilo vigente en `salario.js`), `node:test` para pruebas, localStorage vía `MF.db`, build con `node build.js`.

## Global Constraints

- **Estilo del módulo:** `salario.js` y `reporte.js` usan `var` y `function() {}`, no `const`/arrow. Mantener ese estilo dentro de `salario.js`. `db.js` usa `const`/arrow: mantener *ese* estilo en los cambios a `db.js`.
- **Sin bump de `_CURRENT_VERSION`.** El cambio es aditivo. Se defaultea al leer, igual que `configuracion.js` con `reminderEnabled` / `currency`.
- **Invariante de seguridad de `salario.js`:** ningún dato del usuario se interpola en `innerHTML`. Las descripciones se insertan con `textContent` / `value`.
- **Sin dependencias nuevas.** `devDependencies` está vacío y debe seguir así.
- **Commits gated:** el CLAUDE.md del usuario prohíbe commitear sin autorización explícita. Los pasos "Commit" son puntos de control — pedir autorización antes de ejecutarlos.
- **Multiplicadores exactos:** diurna `2.00`, nocturna `2.50`, feriado `2.00`, día no trabajado `1.00` (resta). Topes: ISSS `1000`, AFP `7045.06`.
- **Verificación:** `npm test` debe pasar (56 tests existentes + los nuevos) y `npm run build` debe completar sin error.

---

### Task 1: Lógica pura de cálculo

**Files:**
- Modify: `src/modules/salario.js` (agregar funciones; reemplazar `_calcRelacion` en las líneas 33-48; actualizar el `module.exports` de la línea 260)
- Test: `test/salario.test.js` (crear)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizarCfg(cfg) -> Cfg` donde `Cfg = { bruto:number, frecuencia:'mensual'|'quincenal', insaforp:boolean, horasDiurnas:number, horasNocturnas:number, diasFeriados:number, diasNoTrabajados:number, otrosIngresos:Array<{id:string,desc:string,monto:number,gravable:boolean}>, otrosDescuentos:Array<{id:string,desc:string,monto:number}> }`
  - `calcBaseHoraria(bruto, frecuencia) -> { salarioDiario:number, horaOrdinaria:number }`
  - `calcAjustes(cfg) -> { extraDiurna, extraNocturna, feriados, diasNoTrabajados, otrosIngresosGravables, otrosIngresosNoGravables, otrosDescuentos }` (todos `number`, todos positivos; `diasNoTrabajados` y `otrosDescuentos` son magnitudes a restar)
  - `calcRelacion(cfg) -> { salarioDiario, horaOrdinaria, extraDiurna, extraNocturna, feriados, diasNoTrabajados, otrosIngresosGravables, otrosIngresosNoGravables, otrosDescuentos, baseGravable, totalDevengado, isssEmp, afpEmp, isr, neto, isssPat, afpPat, ins, costo, ajusteNeto }`

**Nota de ruptura:** la firma vieja era `_calcRelacion(bruto, frecuencia, insaforp)`. Pasa a `calcRelacion(cfg)`. Los únicos llamadores son `_updateRelacion` y `_copyRelacion`, que se actualizan en las tareas 3 y 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/salario.test.js`:

```js
// test/salario.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const {
  normalizarCfg,
  calcBaseHoraria,
  calcAjustes,
  calcRelacion
} = require('../src/modules/salario');

// Los cálculos arrastran decimales periódicos (1000/30); comparar con tolerancia.
function aprox(actual, esperado, tol) {
  tol = tol || 0.005;
  assert.ok(
    Math.abs(actual - esperado) < tol,
    'esperaba ~' + esperado + ' pero recibí ' + actual
  );
}

function cfg(extra) {
  return Object.assign({
    bruto: 960, frecuencia: 'mensual', insaforp: false,
    horasDiurnas: 0, horasNocturnas: 0, diasFeriados: 0, diasNoTrabajados: 0,
    otrosIngresos: [], otrosDescuentos: []
  }, extra || {});
}

describe('calcBaseHoraria', () => {
  test('mensual divide entre 30 días y 8 horas', () => {
    const b = calcBaseHoraria(960, 'mensual');
    aprox(b.salarioDiario, 32);
    aprox(b.horaOrdinaria, 4);
  });

  test('quincenal divide entre 15 días y 8 horas', () => {
    const b = calcBaseHoraria(960, 'quincenal');
    aprox(b.salarioDiario, 64);
    aprox(b.horaOrdinaria, 8);
  });

  test('bruto 0 no produce NaN ni Infinity', () => {
    const b = calcBaseHoraria(0, 'mensual');
    assert.equal(b.salarioDiario, 0);
    assert.equal(b.horaOrdinaria, 0);
  });
});

describe('calcAjustes', () => {
  test('hora extra diurna se paga al doble', () => {
    // hora ordinaria = 4.00 → 10 h × 4 × 2 = 80
    aprox(calcAjustes(cfg({ horasDiurnas: 10 })).extraDiurna, 80);
  });

  test('hora extra nocturna se paga a 2.5x', () => {
    // 10 h × 4 × 2.5 = 100
    aprox(calcAjustes(cfg({ horasNocturnas: 10 })).extraNocturna, 100);
  });

  test('día feriado trabajado se paga al doble del diario', () => {
    // 1 d × 32 × 2 = 64
    aprox(calcAjustes(cfg({ diasFeriados: 1 })).feriados, 64);
  });

  test('día no trabajado equivale a un salario diario', () => {
    // 2 d × 32 = 64
    aprox(calcAjustes(cfg({ diasNoTrabajados: 2 })).diasNoTrabajados, 64);
  });

  test('separa otros ingresos gravables de no gravables', () => {
    const a = calcAjustes(cfg({
      otrosIngresos: [
        { id: '1', desc: 'Bono',    monto: 200, gravable: true },
        { id: '2', desc: 'Viático', monto: 75,  gravable: false }
      ]
    }));
    aprox(a.otrosIngresosGravables, 200);
    aprox(a.otrosIngresosNoGravables, 75);
  });

  test('suma los otros descuentos', () => {
    const a = calcAjustes(cfg({
      otrosDescuentos: [
        { id: '1', desc: 'Préstamo', monto: 50 },
        { id: '2', desc: 'Anticipo', monto: 25 }
      ]
    }));
    aprox(a.otrosDescuentos, 75);
  });
});

describe('calcRelacion — topes de ley', () => {
  test('ISSS se topa en $1,000 de base gravable', () => {
    const r = calcRelacion(cfg({ bruto: 1500 }));
    aprox(r.isssEmp, 30); // 1000 × 3%, no 1500 × 3%
  });

  test('AFP se topa en $7,045.06 de base gravable', () => {
    const r = calcRelacion(cfg({ bruto: 8000 }));
    aprox(r.afpEmp, 510.767, 0.01); // 7045.06 × 7.25%
  });

  test('las horas extra empujan la base contra el tope de ISSS', () => {
    // bruto 960 + 40 de extra = 1000 exactos → ISSS = 30
    const r = calcRelacion(cfg({ bruto: 960, horasDiurnas: 5 })); // 5 × 4 × 2 = 40
    aprox(r.baseGravable, 1000);
    aprox(r.isssEmp, 30);
  });
});

describe('calcRelacion — gravable vs no gravable', () => {
  test('un ingreso gravable aumenta ISSS, AFP e ISR', () => {
    const base = calcRelacion(cfg());
    const con  = calcRelacion(cfg({
      otrosIngresos: [{ id: '1', desc: 'Bono', monto: 100, gravable: true }]
    }));
    assert.ok(con.isssEmp > base.isssEmp);
    assert.ok(con.afpEmp  > base.afpEmp);
    assert.ok(con.isr     > base.isr);
  });

  test('un ingreso no gravable deja intactas las deducciones de ley', () => {
    const base = calcRelacion(cfg());
    const con  = calcRelacion(cfg({
      otrosIngresos: [{ id: '1', desc: 'Viático', monto: 100, gravable: false }]
    }));
    aprox(con.isssEmp, base.isssEmp);
    aprox(con.afpEmp,  base.afpEmp);
    aprox(con.isr,     base.isr);
    aprox(con.neto,    base.neto + 100);
  });
});

describe('calcRelacion — otros descuentos', () => {
  test('no alteran la base del ISR, solo el neto', () => {
    const base = calcRelacion(cfg());
    const con  = calcRelacion(cfg({
      otrosDescuentos: [{ id: '1', desc: 'Préstamo', monto: 100 }]
    }));
    aprox(con.isr, base.isr);
    aprox(con.baseGravable, base.baseGravable);
    aprox(con.neto, base.neto - 100);
  });

  test('no afectan el costo patronal', () => {
    const base = calcRelacion(cfg());
    const con  = calcRelacion(cfg({
      otrosDescuentos: [{ id: '1', desc: 'Préstamo', monto: 100 }]
    }));
    aprox(con.costo, base.costo);
  });
});

describe('calcRelacion — costo patronal sobre base gravable', () => {
  test('las horas extra aumentan el costo patronal', () => {
    const r = calcRelacion(cfg({ bruto: 1000, horasDiurnas: 10, insaforp: false }));
    // baseGravable = 1000 + 83.333 = 1083.333
    aprox(r.isssPat, 75);                 // min(1083.33, 1000) × 7.5%
    aprox(r.afpPat, 94.792, 0.01);        // 1083.333 × 8.75%
    aprox(r.costo, 1083.333 + 75 + 94.792, 0.02);
  });

  test('INSAFORP se calcula sobre la base gravable', () => {
    const r = calcRelacion(cfg({ bruto: 1000, horasDiurnas: 10, insaforp: true }));
    aprox(r.ins, 10.833, 0.01);           // 1083.333 × 1%
  });
});

describe('calcRelacion — caso de referencia del spec', () => {
  test('bruto $1,000 con extras, feriado, ausencias y préstamo → neto $879.80', () => {
    const r = calcRelacion(cfg({
      bruto: 1000,
      horasDiurnas: 10,
      horasNocturnas: 4,
      diasFeriados: 1,
      diasNoTrabajados: 2,
      otrosDescuentos: [{ id: '1', desc: 'Préstamo planilla', monto: 50 }]
    }));

    aprox(r.extraDiurna,     83.33, 0.01);
    aprox(r.extraNocturna,   41.67, 0.01);
    aprox(r.feriados,        66.67, 0.01);
    aprox(r.diasNoTrabajados,66.67, 0.01);
    aprox(r.baseGravable,   1125.00, 0.01);
    aprox(r.totalDevengado, 1125.00, 0.01);
    aprox(r.isssEmp,          30.00, 0.01);
    aprox(r.afpEmp,           81.56, 0.01);
    aprox(r.isr,              83.64, 0.01);
    aprox(r.neto,            879.80, 0.01);
    aprox(r.ajusteNeto,       75.00, 0.01); // 1125 − 1000 − 50
  });
});

describe('calcRelacion — bordes', () => {
  test('días no trabajados que superan el mes no vuelven negativa la base', () => {
    const r = calcRelacion(cfg({ bruto: 960, diasNoTrabajados: 45 }));
    assert.equal(r.baseGravable, 0);
    assert.equal(r.isssEmp, 0);
    assert.equal(r.isr, 0);
  });

  test('cfg vacío no explota', () => {
    const r = calcRelacion({});
    assert.equal(r.neto, 0);
    assert.equal(r.costo, 0);
  });
});

describe('normalizarCfg', () => {
  test('undefined produce la configuración por defecto', () => {
    const c = normalizarCfg(undefined);
    assert.equal(c.bruto, 0);
    assert.equal(c.frecuencia, 'mensual');
    assert.equal(c.insaforp, false);
    assert.deepEqual(c.otrosIngresos, []);
    assert.deepEqual(c.otrosDescuentos, []);
  });

  test('números negativos, NaN y strings basura caen a 0', () => {
    const c = normalizarCfg({ bruto: -50, horasDiurnas: NaN, diasFeriados: 'abc' });
    assert.equal(c.bruto, 0);
    assert.equal(c.horasDiurnas, 0);
    assert.equal(c.diasFeriados, 0);
  });

  test('acepta strings numéricos que vienen de inputs HTML', () => {
    const c = normalizarCfg({ bruto: '1000.50', horasDiurnas: '8' });
    assert.equal(c.bruto, 1000.5);
    assert.equal(c.horasDiurnas, 8);
  });

  test('frecuencia inválida cae a mensual', () => {
    assert.equal(normalizarCfg({ frecuencia: 'semanal' }).frecuencia, 'mensual');
    assert.equal(normalizarCfg({ frecuencia: 'quincenal' }).frecuencia, 'quincenal');
  });

  test('listas ausentes o no-array quedan vacías', () => {
    const c = normalizarCfg({ otrosIngresos: 'no soy array', otrosDescuentos: null });
    assert.deepEqual(c.otrosIngresos, []);
    assert.deepEqual(c.otrosDescuentos, []);
  });

  test('las filas reciben id si no lo traen y gravable por defecto true', () => {
    const c = normalizarCfg({ otrosIngresos: [{ desc: 'Bono', monto: 100 }] });
    assert.ok(c.otrosIngresos[0].id);
    assert.equal(c.otrosIngresos[0].gravable, true);
  });

  test('gravable false se respeta', () => {
    const c = normalizarCfg({
      otrosIngresos: [{ id: 'x', desc: 'Viático', monto: 75, gravable: false }]
    });
    assert.equal(c.otrosIngresos[0].gravable, false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test`
Expected: FAIL. Los `require` de `normalizarCfg`, `calcBaseHoraria`, `calcAjustes` y `calcRelacion` devuelven `undefined` porque `salario.js` solo exporta `render`, así que los tests fallan con `TypeError: calcBaseHoraria is not a function`.

- [ ] **Step 3: Implementar la lógica**

En `src/modules/salario.js`, **reemplazar** el bloque `_calcRelacion` (líneas 33-48) por lo siguiente:

```js
// ── Configuración ──────────────────────────────────────────────────────────

function _num(v) {
  var n = Number(v);
  return (isFinite(n) && n > 0) ? n : 0;
}

function _genId() {
  if (typeof MF !== 'undefined' && MF.db && MF.db.generateId) return MF.db.generateId();
  return 'sal-' + Math.random().toString(36).slice(2, 10);
}

function _normLista(arr, conGravable) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(it) {
    it = it || {};
    var row = {
      id:    it.id || _genId(),
      desc:  typeof it.desc === 'string' ? it.desc : '',
      monto: _num(it.monto)
    };
    if (conGravable) row.gravable = it.gravable !== false;
    return row;
  });
}

function normalizarCfg(cfg) {
  cfg = cfg || {};
  return {
    bruto:            _num(cfg.bruto),
    frecuencia:       cfg.frecuencia === 'quincenal' ? 'quincenal' : 'mensual',
    insaforp:         !!cfg.insaforp,
    horasDiurnas:     _num(cfg.horasDiurnas),
    horasNocturnas:   _num(cfg.horasNocturnas),
    diasFeriados:     _num(cfg.diasFeriados),
    diasNoTrabajados: _num(cfg.diasNoTrabajados),
    otrosIngresos:    _normLista(cfg.otrosIngresos, true),
    otrosDescuentos:  _normLista(cfg.otrosDescuentos, false)
  };
}

// ── Cálculo ────────────────────────────────────────────────────────────────

// Mes comercial de 30 días / quincena de 15, jornada ordinaria de 8 h (Art. 161 CT).
function calcBaseHoraria(bruto, frecuencia) {
  var dias = frecuencia === 'quincenal' ? 15 : 30;
  var salarioDiario = _num(bruto) / dias;
  return { salarioDiario: salarioDiario, horaOrdinaria: salarioDiario / 8 };
}

// Recargos: extra diurna 100% (Art. 169), nocturna 25% + 100% = 2.5x (Art. 168),
// feriado trabajado ordinario + 100% (Art. 192).
function calcAjustes(cfg) {
  cfg = normalizarCfg(cfg);
  var base = calcBaseHoraria(cfg.bruto, cfg.frecuencia);

  var gravables = 0, noGravables = 0;
  cfg.otrosIngresos.forEach(function(it) {
    if (it.gravable) gravables += it.monto; else noGravables += it.monto;
  });

  var descuentos = cfg.otrosDescuentos.reduce(function(s, it) { return s + it.monto; }, 0);

  return {
    extraDiurna:              cfg.horasDiurnas     * base.horaOrdinaria * 2,
    extraNocturna:            cfg.horasNocturnas   * base.horaOrdinaria * 2.5,
    feriados:                 cfg.diasFeriados     * base.salarioDiario * 2,
    diasNoTrabajados:         cfg.diasNoTrabajados * base.salarioDiario,
    otrosIngresosGravables:   gravables,
    otrosIngresosNoGravables: noGravables,
    otrosDescuentos:          descuentos
  };
}

function calcRelacion(cfg) {
  cfg = normalizarCfg(cfg);
  var base = calcBaseHoraria(cfg.bruto, cfg.frecuencia);
  var aj   = calcAjustes(cfg);

  var baseGravable = cfg.bruto
    + aj.extraDiurna + aj.extraNocturna + aj.feriados
    - aj.diasNoTrabajados
    + aj.otrosIngresosGravables;
  if (baseGravable < 0) baseGravable = 0;

  var totalDevengado = baseGravable + aj.otrosIngresosNoGravables;

  var isssEmp = Math.min(baseGravable, 1000)    * 0.03;
  var afpEmp  = Math.min(baseGravable, 7045.06) * 0.0725;
  var renta   = Math.max(0, baseGravable - isssEmp - afpEmp);
  var isr     = _calcISR(renta, cfg.frecuencia);
  var neto    = totalDevengado - isssEmp - afpEmp - isr - aj.otrosDescuentos;

  var isssPat = Math.min(baseGravable, 1000) * 0.075;
  var afpPat  = baseGravable * 0.0875;
  var ins     = cfg.insaforp ? baseGravable * 0.01 : 0;
  var costo   = totalDevengado + isssPat + afpPat + ins;

  return {
    salarioDiario: base.salarioDiario,
    horaOrdinaria: base.horaOrdinaria,
    extraDiurna:              aj.extraDiurna,
    extraNocturna:            aj.extraNocturna,
    feriados:                 aj.feriados,
    diasNoTrabajados:         aj.diasNoTrabajados,
    otrosIngresosGravables:   aj.otrosIngresosGravables,
    otrosIngresosNoGravables: aj.otrosIngresosNoGravables,
    otrosDescuentos:          aj.otrosDescuentos,
    baseGravable: baseGravable, totalDevengado: totalDevengado,
    isssEmp: isssEmp, afpEmp: afpEmp, isr: isr, neto: neto,
    isssPat: isssPat, afpPat: afpPat, ins: ins, costo: costo,
    ajusteNeto: totalDevengado - cfg.bruto - aj.otrosDescuentos
  };
}
```

En la línea 260, cambiar el export:

```js
var _salarioAPI = {
  render: render,
  normalizarCfg: normalizarCfg,
  calcBaseHoraria: calcBaseHoraria,
  calcAjustes: calcAjustes,
  calcRelacion: calcRelacion
};
```

Para que el módulo siga cargando mientras las tareas 3 y 5 no están hechas, actualizar de inmediato los dos llamadores viejos a la firma nueva:

- `_updateRelacion` (línea ~80): `var r = _calcRelacion(bruto, frecuencia, insaforp);` → `var r = calcRelacion({ bruto: bruto, frecuencia: frecuencia, insaforp: insaforp });`
- `_copyRelacion` (línea ~116): el mismo reemplazo.

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test`
Expected: PASS. 56 tests previos + los nuevos, 0 fallos.

- [ ] **Step 5: Commit** *(pedir autorización antes)*

```bash
git add test/salario.test.js src/modules/salario.js
git commit -m "feat(salario): extract pure payroll calculation functions"
```

---

### Task 2: Persistencia en `db.settings.salario`

**Files:**
- Modify: `src/modules/db.js:41-47` (defaults de `settings` en `emptyDB()`)
- Modify: `src/modules/salario.js` (agregar `_loadCfg`, `_saveCfg`, `_saveCfgDebounced`)
- Test: `test/salario.test.js` (agregar un describe)

**Interfaces:**
- Consumes: `normalizarCfg` de la Task 1.
- Produces:
  - `_loadCfg() -> Cfg` — lee de `MF.db`, normaliza, y devuelve defaults si `MF.db` no existe o lanza.
  - `_saveCfg(cfg) -> void` — escritura inmediata.
  - `_saveCfgDebounced(cfg) -> void` — agrupa escrituras en 400 ms.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `test/salario.test.js`:

```js
describe('defaults de salario en db.emptyDB', () => {
  test('emptyDB incluye settings.salario con la forma esperada', () => {
    global.crypto = { randomUUID: () => require('crypto').randomUUID() };
    const db = require('../src/modules/db').emptyDB();
    const s = db.settings.salario;

    assert.ok(s, 'settings.salario debe existir');
    assert.equal(s.bruto, 0);
    assert.equal(s.frecuencia, 'mensual');
    assert.equal(s.insaforp, false);
    assert.equal(s.horasDiurnas, 0);
    assert.equal(s.horasNocturnas, 0);
    assert.equal(s.diasFeriados, 0);
    assert.equal(s.diasNoTrabajados, 0);
    assert.deepEqual(s.otrosIngresos, []);
    assert.deepEqual(s.otrosDescuentos, []);
  });

  test('una base v2 previa sin settings.salario sigue siendo normalizable', () => {
    // Simula localStorage viejo: settings sin la clave salario.
    const viejo = { theme: 'dark', currency: '$' };
    const c = normalizarCfg(viejo.salario);
    assert.equal(c.bruto, 0);
    assert.deepEqual(c.otrosIngresos, []);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test`
Expected: FAIL con `settings.salario debe existir` — `emptyDB()` todavía no incluye la clave.

- [ ] **Step 3: Implementar**

En `src/modules/db.js`, dentro de `emptyDB()`, ampliar el objeto `settings` (líneas 41-47). Usar estilo `const`/objeto literal, que es el del archivo:

```js
    settings: {
      theme: 'dark',
      currency: '$',
      reminderEnabled: false,
      reminderTime: '20:00',
      budgetRollover: false,
      salario: {
        bruto: 0,
        frecuencia: 'mensual',
        insaforp: false,
        horasDiurnas: 0,
        horasNocturnas: 0,
        diasFeriados: 0,
        diasNoTrabajados: 0,
        otrosIngresos: [],
        otrosDescuentos: []
      }
    }
```

No tocar `migrateV1toV2` ni `_CURRENT_VERSION`: las bases existentes se cubren con la normalización al leer.

En `src/modules/salario.js`, agregar después de las funciones de cálculo:

```js
// ── Persistencia ───────────────────────────────────────────────────────────
// Aditivo: no sube _CURRENT_VERSION. Una base v2 sin settings.salario se
// resuelve con los defaults de normalizarCfg, igual que hace configuracion.js.

var _saveTimer = null;

function _loadCfg() {
  try {
    var db = MF.db.loadData();
    return normalizarCfg(db.settings && db.settings.salario);
  } catch (_) {
    return normalizarCfg(null);
  }
}

function _saveCfg(cfg) {
  try {
    var db = MF.db.loadData();
    if (!db.settings) db.settings = {};
    db.settings.salario = normalizarCfg(cfg);
    MF.db.saveData(db);
  } catch (_) {
    // localStorage lleno o no disponible: la calculadora sigue funcionando en memoria.
  }
}

function _saveCfgDebounced(cfg) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() { _saveCfg(cfg); }, 400);
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test`
Expected: PASS, incluidos los dos nuevos.

- [ ] **Step 5: Commit** *(pedir autorización antes)*

```bash
git add src/modules/db.js src/modules/salario.js test/salario.test.js
git commit -m "feat(salario): persist calculator config in db.settings"
```

---

### Task 3: Card plegable con los campos numéricos

**Files:**
- Modify: `src/modules/salario.js` (`render`, `_updateRelacion`)
- Modify: `src/styles/components.css` (agregar sección al final)

**Interfaces:**
- Consumes: `calcRelacion`, `_loadCfg`, `_saveCfgDebounced`.
- Produces:
  - `_readCfgFromDOM() -> Cfg` — arma el cfg leyendo inputs y el estado en memoria de las listas.
  - `_cfgActual` — variable de módulo con el `Cfg` vigente; las listas de la Task 4 la mutan.
  - IDs de DOM: `sal-hd`, `sal-hn`, `sal-df`, `sal-dnt`, `sal-extras-toggle`, `sal-extras-body`, `sal-extras-badge`, `sal-extras-chevron`.

- [ ] **Step 1: Agregar el CSS**

Al final de `src/styles/components.css`:

```css
/* ── Salario: sección de ingresos y descuentos ────────── */
.sal-collapse__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.sal-collapse__chevron {
  flex-shrink: 0;
  transition: transform var(--transition);
}

.sal-collapse__toggle[aria-expanded="true"] .sal-collapse__chevron {
  transform: rotate(90deg);
}

.sal-collapse__badge {
  margin-left: auto;
  font-family: 'DM Mono', monospace;
  font-size: 13px;
}

.sal-collapse__body { margin-top: 14px; }

.sal-hint {
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
  min-height: 15px;   /* reserva la línea para que el layout no salte */
}

.sal-section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  margin: 16px 0 8px;
}
```

- [ ] **Step 2: Escribir el HTML de la card en `render`**

En `src/modules/salario.js`, dentro de `render()`, insertar este bloque entre la card del salario bruto (que termina en `'</div>'` tras el toggle de INSAFORP, línea ~191) y la card "Deducciones del empleado" (línea ~192):

```js
      + '<div class="card" style="margin-bottom:12px">'
        + '<button type="button" class="sal-collapse__toggle" id="sal-extras-toggle" aria-expanded="false" aria-controls="sal-extras-body">'
          + '<svg class="sal-collapse__chevron" id="sal-extras-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
          + '<span class="card-title">Ingresos y descuentos adicionales</span>'
          + '<span class="sal-collapse__badge" id="sal-extras-badge"></span>'
        + '</button>'
        + '<div class="sal-collapse__body" id="sal-extras-body" style="display:none">'
          + '<div class="form-row">'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-hd">Horas extra diurnas</label>'
              + '<input class="form-input" id="sal-hd" type="number" min="0" step="0.5" placeholder="0">'
              + '<div class="sal-hint" id="sal-hd-hint"></div>'
            + '</div>'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-hn">Horas extra nocturnas</label>'
              + '<input class="form-input" id="sal-hn" type="number" min="0" step="0.5" placeholder="0">'
              + '<div class="sal-hint" id="sal-hn-hint"></div>'
            + '</div>'
          + '</div>'
          + '<div class="form-row" style="margin-top:12px">'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-df">Días feriados trabajados</label>'
              + '<input class="form-input" id="sal-df" type="number" min="0" step="1" placeholder="0">'
              + '<div class="sal-hint" id="sal-df-hint">Se paga al doble (Art. 192 CT)</div>'
            + '</div>'
            + '<div class="form-group" style="margin-bottom:0">'
              + '<label class="form-label" for="sal-dnt">Días no trabajados</label>'
              + '<input class="form-input" id="sal-dnt" type="number" min="0" step="1" placeholder="0">'
              + '<div class="sal-hint" id="sal-dnt-hint"></div>'
            + '</div>'
          + '</div>'
          + '<div id="sal-listas"></div>'
        + '</div>'
      + '</div>'
```

El `<div id="sal-listas">` queda vacío en esta tarea; lo llena la Task 4.

- [ ] **Step 3: Cablear lectura, cálculo y persistencia**

Agregar a `src/modules/salario.js`:

```js
var _cfgActual = null;

function _readCfgFromDOM() {
  return normalizarCfg({
    bruto:            document.getElementById('sal-bruto').value,
    frecuencia:       document.getElementById('sal-frecuencia').value,
    insaforp:         document.getElementById('sal-insaforp').checked,
    horasDiurnas:     document.getElementById('sal-hd').value,
    horasNocturnas:   document.getElementById('sal-hn').value,
    diasFeriados:     document.getElementById('sal-df').value,
    diasNoTrabajados: document.getElementById('sal-dnt').value,
    otrosIngresos:    _cfgActual ? _cfgActual.otrosIngresos   : [],
    otrosDescuentos:  _cfgActual ? _cfgActual.otrosDescuentos : []
  });
}
```

Reemplazar `_updateRelacion` completo por:

```js
function _updateRelacion() {
  _cfgActual = _readCfgFromDOM();
  var r = calcRelacion(_cfgActual);

  document.getElementById('sal-hd-hint').textContent  = r.extraDiurna      ? '+' + _fmt(r.extraDiurna)      : '';
  document.getElementById('sal-hn-hint').textContent  = r.extraNocturna    ? '+' + _fmt(r.extraNocturna)    : '';
  document.getElementById('sal-dnt-hint').textContent = r.diasNoTrabajados ? '-' + _fmt(r.diasNoTrabajados) : '';
  document.getElementById('sal-df-hint').textContent  = r.feriados
    ? '+' + _fmt(r.feriados)
    : 'Se paga al doble (Art. 192 CT)';

  var badge = document.getElementById('sal-extras-badge');
  if (Math.abs(r.ajusteNeto) < 0.005) {
    badge.textContent = '';
  } else {
    badge.textContent = (r.ajusteNeto > 0 ? '+' : '-') + _fmt(Math.abs(r.ajusteNeto));
    badge.style.color = r.ajusteNeto > 0 ? 'var(--income)' : 'var(--expense)';
  }

  var filas = '';
  if (r.extraDiurna)      filas += _fila('Hora extra diurna',      '+' + _fmt(r.extraDiurna));
  if (r.extraNocturna)    filas += _fila('Hora extra nocturna',    '+' + _fmt(r.extraNocturna));
  if (r.feriados)         filas += _fila('Día feriado trabajado', '+' + _fmt(r.feriados));
  if (r.diasNoTrabajados) filas += _fila('Días no trabajados',    '-' + _fmt(r.diasNoTrabajados));

  // Se arma en tres tramos porque las descripciones del usuario van intercaladas
  // y solo pueden insertarse por DOM, nunca por innerHTML.
  var emp = document.getElementById('res-emp-rows');
  emp.innerHTML = _fila('Salario bruto', _fmt(_cfgActual.bruto)) + filas;
  _appendFilasOtros(emp, _cfgActual.otrosIngresos, '+');
  emp.insertAdjacentHTML('beforeend',
    _fila('Total devengado', _fmt(r.totalDevengado), 'font-weight:600')
    + _fila('ISSS (3%)',   '-' + _fmt(r.isssEmp))
    + _fila('AFP (7.25%)', '-' + _fmt(r.afpEmp))
    + _fila('ISR',         '-' + _fmt(r.isr)));
  _appendFilasOtros(emp, _cfgActual.otrosDescuentos, '-');

  document.getElementById('res-neto').textContent = _fmt(r.neto);

  document.getElementById('res-pat-rows').innerHTML =
    _fila('Total devengado',        _fmt(r.totalDevengado))
    + _fila('ISSS patronal (7.5%)',  '+' + _fmt(r.isssPat))
    + _fila('AFP patronal (8.75%)',  '+' + _fmt(r.afpPat))
    + (_cfgActual.insaforp ? _fila('INSAFORP (1%)', '+' + _fmt(r.ins)) : '');

  document.getElementById('res-costo').textContent = _fmt(r.costo);

  _saveCfgDebounced(_cfgActual);
}
```

`_appendFilasOtros` la define la Task 4. Para que esta tarea corra sola, agregarla ahora como stub que la Task 4 reemplaza:

```js
function _appendFilasOtros() {}
```

- [ ] **Step 4: Hidratar los inputs y enganchar los listeners**

Al final de `render()`, **antes** de las llamadas `_updateRelacion(); _updatePrestador();`, reemplazar el bloque de listeners de relación laboral por:

```js
  _cfgActual = _loadCfg();
  document.getElementById('sal-bruto').value      = _cfgActual.bruto || '';
  document.getElementById('sal-frecuencia').value = _cfgActual.frecuencia;
  document.getElementById('sal-insaforp').checked = _cfgActual.insaforp;
  document.getElementById('sal-hd').value  = _cfgActual.horasDiurnas     || '';
  document.getElementById('sal-hn').value  = _cfgActual.horasNocturnas   || '';
  document.getElementById('sal-df').value  = _cfgActual.diasFeriados     || '';
  document.getElementById('sal-dnt').value = _cfgActual.diasNoTrabajados || '';

  // Arranca expandida si ya hay datos configurados, para no esconderlos.
  var hayExtras = _cfgActual.horasDiurnas || _cfgActual.horasNocturnas
    || _cfgActual.diasFeriados || _cfgActual.diasNoTrabajados
    || _cfgActual.otrosIngresos.length || _cfgActual.otrosDescuentos.length;
  _setExtrasExpanded(!!hayExtras);

  document.getElementById('sal-extras-toggle').addEventListener('click', function() {
    var abierto = this.getAttribute('aria-expanded') === 'true';
    _setExtrasExpanded(!abierto);
  });

  ['sal-bruto', 'sal-hd', 'sal-hn', 'sal-df', 'sal-dnt'].forEach(function(id) {
    document.getElementById(id).addEventListener('input', _updateRelacion);
  });
  document.getElementById('sal-frecuencia').addEventListener('change', _updateRelacion);
  document.getElementById('sal-insaforp').addEventListener('change', _updateRelacion);
```

Y agregar la función auxiliar a nivel de módulo:

```js
function _setExtrasExpanded(abierto) {
  document.getElementById('sal-extras-toggle').setAttribute('aria-expanded', abierto ? 'true' : 'false');
  document.getElementById('sal-extras-body').style.display = abierto ? '' : 'none';
}
```

- [ ] **Step 5: Verificar**

Run: `npm test && npm run build`
Expected: los tests siguen pasando (la lógica pura no cambió) y el build completa.

Verificación manual: abrir `dist/index.html`, ir a `/#salario`, escribir bruto `1000`, expandir la card, escribir 10 horas diurnas. El hint bajo el input debe decir `+$ 83.33`, el badge `+$ 83.33`, y "Total devengado" `$ 1,083.33`. Recargar la página: los valores deben seguir ahí.

- [ ] **Step 6: Commit** *(pedir autorización antes)*

```bash
git add src/modules/salario.js src/styles/components.css
git commit -m "feat(salario): add collapsible overtime and absence fields"
```

---

### Task 4: Listas dinámicas de otros ingresos y descuentos

**Files:**
- Modify: `src/modules/salario.js` (reemplazar los stubs de la Task 3)
- Modify: `src/styles/components.css` (agregar `.sal-row`)

**Interfaces:**
- Consumes: `_cfgActual`, `_updateRelacion`, `_fmt`, `_fila`, `_genId`.
- Produces:
  - `_renderListas() -> void` — repuebla `#sal-listas` desde `_cfgActual`.
  - `_appendFilasOtros(contenedor, lista, signo) -> void` — agrega al contenedor una fila por ítem con monto ≠ 0, con la descripción insertada por `textContent`.

**Nota de seguridad:** `_fila()` interpola su `label` en `innerHTML`. Las descripciones son entrada libre del usuario, así que **no** pueden pasar por `_fila()`. Por eso el desglose se arma en tres tramos (`innerHTML` → `_appendFilasOtros` → `insertAdjacentHTML` → `_appendFilasOtros`) y las descripciones solo entran por `createElement` + `textContent`.

- [ ] **Step 1: Agregar el CSS de las filas**

Al final de `src/styles/components.css`:

```css
.sal-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.sal-row--gravable {
  grid-template-columns: minmax(0, 1fr) 96px auto auto;
}

.sal-row .form-input { margin: 0; }

.sal-row__grav {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text3);
  white-space: nowrap;
}

/* xs: la descripción ocupa toda la fila y el resto se acomoda debajo */
@media (max-width: 400px) {
  .sal-row,
  .sal-row--gravable { grid-template-columns: minmax(0, 1fr) 84px auto; }
  .sal-row--gravable .sal-row__desc { grid-column: 1 / -1; }
}
```

- [ ] **Step 2: Reemplazar los stubs por la implementación real**

En `src/modules/salario.js`, borrar el stub `function _appendFilasOtros() {}` y poner:

```js
// Las descripciones son entrada libre del usuario: se insertan por textContent,
// nunca por innerHTML. _fila() queda reservado para labels hardcoded.
function _appendFilasOtros(contenedor, lista, signo) {
  lista.forEach(function(it) {
    if (!it.monto) return;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)';

    var label = document.createElement('span');
    label.style.cssText = 'font-size:13px;color:var(--text2)';
    label.textContent = it.desc || 'Sin descripción';

    var valor = document.createElement('span');
    valor.className = 'mono';
    valor.style.cssText = 'font-size:13px';
    valor.textContent = signo + _fmt(it.monto);

    row.appendChild(label);
    row.appendChild(valor);
    contenedor.appendChild(row);
  });
}
```

- [ ] **Step 3: Construir las listas editables**

Agregar a `src/modules/salario.js`:

```js
var _TRASH_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

function _filaEditable(item, lista, conGravable) {
  var row = document.createElement('div');
  row.className = conGravable ? 'sal-row sal-row--gravable' : 'sal-row';

  var desc = document.createElement('input');
  desc.className = 'form-input sal-row__desc';
  desc.type = 'text';
  desc.placeholder = 'Descripción';
  desc.value = item.desc;
  desc.addEventListener('input', function() {
    item.desc = desc.value;
    _updateRelacion();
  });

  var monto = document.createElement('input');
  monto.className = 'form-input';
  monto.type = 'number';
  monto.min = '0';
  monto.step = '0.01';
  monto.placeholder = '0.00';
  monto.value = item.monto || '';
  monto.addEventListener('input', function() {
    item.monto = _num(monto.value);
    _updateRelacion();
  });

  row.appendChild(desc);
  row.appendChild(monto);

  if (conGravable) {
    var wrap = document.createElement('label');
    wrap.className = 'sal-row__grav';
    wrap.title = 'Gravable: paga ISSS, AFP e ISR';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = item.gravable;
    chk.addEventListener('change', function() {
      item.gravable = chk.checked;
      _updateRelacion();
    });
    var txt = document.createElement('span');
    txt.textContent = 'Grav.';
    wrap.appendChild(chk);
    wrap.appendChild(txt);
    row.appendChild(wrap);
  }

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-icon';
  del.setAttribute('aria-label', 'Eliminar fila');
  del.innerHTML = _TRASH_ICON;
  del.addEventListener('click', function() {
    var i = lista.indexOf(item);
    if (i >= 0) lista.splice(i, 1);
    _renderListas();
    _updateRelacion();
  });
  row.appendChild(del);

  return row;
}

function _seccionLista(titulo, lista, conGravable, textoBoton) {
  var frag = document.createDocumentFragment();

  var h = document.createElement('div');
  h.className = 'sal-section-title';
  h.textContent = titulo;
  frag.appendChild(h);

  lista.forEach(function(item) {
    frag.appendChild(_filaEditable(item, lista, conGravable));
  });

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.style.width = '100%';
  add.textContent = textoBoton;
  add.addEventListener('click', function() {
    var nuevo = { id: _genId(), desc: '', monto: 0 };
    if (conGravable) nuevo.gravable = true;
    lista.push(nuevo);
    _renderListas();
    var inputs = document.querySelectorAll('#sal-listas .sal-row__desc');
    if (inputs.length) inputs[inputs.length - 1].focus();
    _updateRelacion();
  });
  frag.appendChild(add);

  return frag;
}

function _renderListas() {
  var cont = document.getElementById('sal-listas');
  if (!cont) return;
  cont.textContent = '';
  cont.appendChild(_seccionLista('Otros ingresos',   _cfgActual.otrosIngresos,   true,  '+ Agregar ingreso'));
  cont.appendChild(_seccionLista('Otros descuentos', _cfgActual.otrosDescuentos, false, '+ Agregar descuento'));
}
```

**Cuidado con el foco:** `_seccionLista` re-renderiza ambas listas, así que el `querySelectorAll` de arriba enfoca la última descripción de *descuentos* si se agregó un descuento, pero la de ingresos queda antes en el DOM. Para enfocar la fila correcta, reemplazar ese bloque por:

```js
    lista.push(nuevo);
    _renderListas();
    var sel = '#sal-listas .sal-row__desc';
    var todas = Array.prototype.slice.call(document.querySelectorAll(sel));
    var offset = conGravable ? 0 : _cfgActual.otrosIngresos.length;
    var idx = offset + lista.indexOf(nuevo);
    if (todas[idx]) todas[idx].focus();
    _updateRelacion();
```

- [ ] **Step 4: Llamar a `_renderListas` en `render()`**

En `render()`, justo después de `_setExtrasExpanded(!!hayExtras);`, agregar:

```js
  _renderListas();
```

- [ ] **Step 5: Verificar**

Run: `npm test && npm run build`
Expected: tests pasan, build completa.

Verificación manual en `dist/index.html`, `/#salario`:
1. Expandir la card, agregar un ingreso "Bono" de `200` con gravable marcado. El ISSS debe subir.
2. Desmarcar gravable. El ISSS debe volver a su valor anterior y el neto subir.
3. Agregar un descuento "Préstamo" de `50`. El ISR no debe cambiar; el neto baja $50.
4. Escribir `<img src=x onerror=alert(1)>` como descripción. Debe aparecer como texto literal en el desglose, sin ejecutar nada.
5. Eliminar una fila con el botón de papelera. Debe desaparecer del desglose.
6. Recargar. Las listas deben seguir ahí.

- [ ] **Step 6: Commit** *(pedir autorización antes)*

```bash
git add src/modules/salario.js src/styles/components.css
git commit -m "feat(salario): add editable income and deduction lists"
```

---

### Task 5: Resumen copiado y comentario de seguridad

**Files:**
- Modify: `src/modules/salario.js` (`_copyRelacion`, líneas 112-138; cabecera, líneas 1-5)

**Interfaces:**
- Consumes: `_cfgActual`, `calcRelacion`, `_fmt`.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Reescribir `_copyRelacion`**

```js
function _copyRelacion() {
  var cfg = _readCfgFromDOM();
  var r   = calcRelacion(cfg);
  var freqLabel = cfg.frecuencia === 'quincenal' ? 'Quincenal' : 'Mensual';

  function linea(label, monto, signo) {
    var etiqueta = (label + ':').padEnd(26, ' ');
    return etiqueta + (signo || ' ') + _fmt(monto) + '\n';
  }

  var texto = '=== Calculadora Salarial — Relación Laboral ===\n'
    + linea('Salario bruto', cfg.bruto) .replace('\n', ' (' + freqLabel + ')\n');

  var ingresos = '';
  if (r.extraDiurna)   ingresos += linea('Hora extra diurna (' + cfg.horasDiurnas + 'h)', r.extraDiurna, '+');
  if (r.extraNocturna) ingresos += linea('Hora extra nocturna (' + cfg.horasNocturnas + 'h)', r.extraNocturna, '+');
  if (r.feriados)      ingresos += linea('Día feriado (' + cfg.diasFeriados + 'd)', r.feriados, '+');
  cfg.otrosIngresos.forEach(function(it) {
    if (it.monto) ingresos += linea(it.desc || 'Sin descripción', it.monto, '+');
  });
  if (ingresos) texto += '\n— Ingresos adicionales —\n' + ingresos;

  var descuentos = '';
  if (r.diasNoTrabajados) descuentos += linea('Días no trabajados (' + cfg.diasNoTrabajados + 'd)', r.diasNoTrabajados, '-');
  cfg.otrosDescuentos.forEach(function(it) {
    if (it.monto) descuentos += linea(it.desc || 'Sin descripción', it.monto, '-');
  });
  if (descuentos) texto += '\n— Descuentos adicionales —\n' + descuentos;

  texto += '\n' + linea('Total devengado', r.totalDevengado)
    + '\n— Deducciones de ley —\n'
    + linea('ISSS (3%)',   r.isssEmp, '-')
    + linea('AFP (7.25%)', r.afpEmp,  '-')
    + linea('ISR',         r.isr,     '-')
    + linea('Salario neto', r.neto)
    + '\n— Costo patronal —\n'
    + linea('Total devengado',       r.totalDevengado)
    + linea('ISSS patronal (7.5%)',  r.isssPat, '+')
    + linea('AFP patronal (8.75%)',  r.afpPat,  '+')
    + (cfg.insaforp ? linea('INSAFORP (1%)', r.ins, '+') : '')
    + linea('Costo total', r.costo);

  navigator.clipboard.writeText(texto).then(function() {
    MF.nav.toast('¡Copiado!', 'success');
  }).catch(function() {
    MF.nav.toast('No se pudo copiar', 'error');
  });
}
```

- [ ] **Step 2: Actualizar el comentario de cabecera**

Reemplazar las líneas 1-5 de `src/modules/salario.js`:

```js
// src/modules/salario.js
// Calculadora Salarial El Salvador 2025.
// Seguridad: las asignaciones a innerHTML usan _fila() con labels hardcoded y
// _fmt(), que produce exclusivamente el patrón "$ X,XXX.XX". Las descripciones
// de otros ingresos/descuentos son entrada libre del usuario y NUNCA pasan por
// _fila(): se insertan con createElement + textContent (_appendFilasOtros,
// _filaEditable). El texto que va al portapapeles es texto plano.
```

- [ ] **Step 3: Verificar**

Run: `npm test && npm run build`
Expected: tests pasan, build completa.

Verificación manual: con el caso de referencia cargado (bruto 1000, 10 diurnas, 4 nocturnas, 1 feriado, 2 no trabajados, préstamo 50), pulsar "Copiar resumen" y pegar. Debe verse el desglose con las secciones de ingresos y descuentos, `Total devengado: $ 1,125.00` y `Salario neto: $ 879.80`.

- [ ] **Step 4: Commit** *(pedir autorización antes)*

```bash
git add src/modules/salario.js
git commit -m "feat(salario): include adjustments in copied summary"
```

---

## Self-Review

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| Base horaria mensual/quincenal | 1 |
| Multiplicadores 2.0 / 2.5 / 2.0 / −1.0 | 1 |
| Orden de aplicación y topes ISSS/AFP | 1 |
| Costo patronal sobre `baseGravable` | 1 |
| Clamp de `baseGravable` a 0 | 1 |
| `db.settings.salario` sin bump de versión | 2 |
| Normalización defensiva al leer | 1 (`normalizarCfg`), 2 (`_loadCfg`) |
| Debounce de 400 ms | 2 |
| Card plegable con badge honesto | 3 |
| Auto-expandir si hay datos | 3 |
| Hints con el monto calculado | 3 |
| Filas del desglose solo si ≠ 0 | 3 |
| Listas con toggle gravable | 4 |
| Descripción vacía → "Sin descripción" | 4 |
| Foco en la fila nueva | 4 |
| Construcción por DOM (seguridad) | 4 |
| Resumen copiado extendido | 5 |
| Comentario de cabecera actualizado | 5 |
| 10 casos de test del spec | 1, 2 |

**Consistencia de nombres:** `calcRelacion` (sin guion bajo, exportada) sustituye a `_calcRelacion` en todos los llamadores — Task 1 Step 3 lo hace explícito. `_appendFilasOtros` se declara como stub vacío en la Task 3 y se implementa en la Task 4 con la misma firma. `_cfgActual` se crea en la Task 3 y la Task 4 la muta por referencia. `_num` y `_genId` nacen en la Task 1 y los reutilizan las tareas 2 y 4.

**Orden de dependencias:** 1 → 2 → 3 → 4 → 5. La Task 3 depende de 1 y 2; la 4 depende de 3; la 5 depende de 3. Ninguna tarea deja el módulo en estado no cargable: la Task 1 actualiza los llamadores viejos en el mismo paso que cambia la firma, y la Task 3 declara el stub que la Task 4 rellena.
