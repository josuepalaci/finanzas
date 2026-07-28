// test/salario.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const {
  normalizarCfg,
  calcBaseHoraria,
  calcAjustes,
  calcRelacion,
  _loadCfg,
  _saveCfg,
  _saveCfgDebounced,
  _readCfgFromDOM,
  _setCfgActualParaTest
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
});

describe('Persistencia: _loadCfg, _saveCfg, _saveCfgDebounced', () => {
  test('_loadCfg devuelve defaults cuando db no tiene settings.salario', () => {
    const fakeDb = {
      loadData: function() { return { settings: { theme: 'dark' } }; }
    };
    global.MF = { db: fakeDb };

    const cfg = _loadCfg();
    assert.equal(cfg.bruto, 0);
    assert.equal(cfg.frecuencia, 'mensual');
    assert.deepEqual(cfg.otrosIngresos, []);

    delete global.MF;
  });

  test('_loadCfg devuelve valores persistidos cuando existen', () => {
    const persistido = {
      bruto: 1500,
      frecuencia: 'quincenal',
      insaforp: true,
      horasDiurnas: 5,
      horasNocturnas: 2,
      diasFeriados: 1,
      diasNoTrabajados: 0,
      otrosIngresos: [{ id: '1', desc: 'Bono', monto: 100, gravable: true }],
      otrosDescuentos: []
    };
    const fakeDb = {
      loadData: function() { return { settings: { salario: persistido } }; }
    };
    global.MF = { db: fakeDb };

    const cfg = _loadCfg();
    assert.equal(cfg.bruto, 1500);
    assert.equal(cfg.frecuencia, 'quincenal');
    assert.equal(cfg.insaforp, true);
    assert.equal(cfg.horasDiurnas, 5);
    assert.equal(cfg.otrosIngresos[0].monto, 100);

    delete global.MF;
  });

  test('_loadCfg devuelve defaults sin lanzar cuando loadData lanza', () => {
    const fakeDb = {
      loadData: function() { throw new Error('Storage error'); }
    };
    global.MF = { db: fakeDb };

    const cfg = _loadCfg();
    assert.equal(cfg.bruto, 0);
    assert.equal(cfg.frecuencia, 'mensual');
    assert.deepEqual(cfg.otrosIngresos, []);

    delete global.MF;
  });

  test('_saveCfg escribe en db.settings.salario y llama saveData', () => {
    let savedDb = null;
    const fakeDb = {
      loadData: function() { return { settings: {} }; },
      saveData: function(db) { savedDb = db; }
    };
    global.MF = { db: fakeDb };

    const cfg = { bruto: 2000, frecuencia: 'mensual', insaforp: false, horasDiurnas: 0, horasNocturnas: 0, diasFeriados: 0, diasNoTrabajados: 0, otrosIngresos: [], otrosDescuentos: [] };
    _saveCfg(cfg);

    assert.ok(savedDb, 'saveData debe haber sido llamado');
    assert.equal(savedDb.settings.salario.bruto, 2000);
    assert.equal(savedDb.settings.salario.frecuencia, 'mensual');

    delete global.MF;
  });

  test('_saveCfg no lanza cuando saveData lanza Storage full', () => {
    const fakeDb = {
      loadData: function() { return { settings: {} }; },
      saveData: function() { throw new Error('Storage full: unable to save data. Free up space and try again.'); }
    };
    global.MF = { db: fakeDb };

    const cfg = { bruto: 2000, frecuencia: 'mensual', insaforp: false, horasDiurnas: 0, horasNocturnas: 0, diasFeriados: 0, diasNoTrabajados: 0, otrosIngresos: [], otrosDescuentos: [] };

    assert.doesNotThrow(() => {
      _saveCfg(cfg);
    });

    delete global.MF;
  });

  test('_saveCfgDebounced agrupa múltiples writes en una sola después de 400ms', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    try {
      let writeCount = 0;
      const fakeDb = {
        loadData: function() { return { settings: {} }; },
        saveData: function() { writeCount++; }
      };
      global.MF = { db: fakeDb };

      const cfg = { bruto: 2000, frecuencia: 'mensual', insaforp: false, horasDiurnas: 0, horasNocturnas: 0, diasFeriados: 0, diasNoTrabajados: 0, otrosIngresos: [], otrosDescuentos: [] };

      _saveCfgDebounced(cfg);
      _saveCfgDebounced(cfg);
      _saveCfgDebounced(cfg);

      assert.equal(writeCount, 0, 'no debe escribir inmediatamente');

      t.mock.timers.tick(400);

      assert.equal(writeCount, 1, 'debe escribir exactamente una vez después de 400ms');
    } finally {
      delete global.MF;
    }
  });
});

describe('_readCfgFromDOM — regresión: las listas se conservan por referencia', () => {
  // Stub mínimo de document: getElementById devuelve un objeto con .value
  // (o .checked para el checkbox de INSAFORP) según los IDs que lee _readCfgFromDOM.
  function stubDocument(overrides) {
    const values = Object.assign({
      'sal-bruto': '1000', 'sal-frecuencia': 'mensual', 'sal-insaforp': false,
      'sal-hd': '0', 'sal-hn': '0', 'sal-df': '0', 'sal-dnt': '0'
    }, overrides || {});
    global.document = {
      getElementById: function(id) {
        if (id === 'sal-insaforp') return { checked: values[id] };
        return { value: values[id] };
      }
    };
  }

  test('cfg.otrosIngresos es la misma referencia de array (y de item) que _cfgActual', () => {
    const item = { id: '1', desc: 'Bono', monto: 100, gravable: true };
    const listaOriginal = [item];
    _setCfgActualParaTest({ otrosIngresos: listaOriginal, otrosDescuentos: [] });
    stubDocument();

    try {
      const cfg = _readCfgFromDOM();

      // Con el bug (normalizarCfg recibiendo las listas y recreándolas via .map()),
      // estas dos aserciones fallan: serían array/objeto nuevos, no los originales.
      assert.strictEqual(cfg.otrosIngresos, listaOriginal);
      assert.strictEqual(cfg.otrosIngresos[0], item);
    } finally {
      delete global.document;
      _setCfgActualParaTest(null);
    }
  });

  test('mutar un item después del round-trip se refleja en la siguiente lectura', () => {
    const item = { id: '1', desc: 'Bono', monto: 100, gravable: true };
    _setCfgActualParaTest({ otrosIngresos: [item], otrosDescuentos: [] });
    stubDocument();

    try {
      _readCfgFromDOM(); // primera lectura, como haría _updateRelacion() al montar
      item.monto = 500;  // el handler de input de _filaEditable mutaría así el item
      const cfg2 = _readCfgFromDOM();

      assert.strictEqual(cfg2.otrosIngresos[0], item);
      assert.equal(cfg2.otrosIngresos[0].monto, 500);
    } finally {
      delete global.document;
      _setCfgActualParaTest(null);
    }
  });

  test('sin _cfgActual previo, devuelve arrays vacíos (no explota)', () => {
    _setCfgActualParaTest(null);
    stubDocument();

    try {
      const cfg = _readCfgFromDOM();
      assert.deepEqual(cfg.otrosIngresos, []);
      assert.deepEqual(cfg.otrosDescuentos, []);
    } finally {
      delete global.document;
    }
  });
});
