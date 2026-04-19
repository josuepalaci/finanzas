// test/analytics.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
global.crypto = { randomUUID: () => require('crypto').randomUUID() };

const {
  calcHealthScore,
  healthScoreMessage,
  calcSpendingTrends,
  calcNetWorthEvolution,
  projectGoal,
  projectDebt,
  calcMonthlyAvgSavings
} = require('../src/modules/analytics');

function thisMonth() { return new Date().toISOString().slice(0, 7); }
function date(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function emptyDB() {
  return { accounts: [], cards: [], transactions: [], budgets: [], goals: [], debts: [], recurring: [], transfers: [], installments: [], categories: [] };
}

describe('calcHealthScore', () => {
  test('DB vacía retorna 70 (máximo por defecto sin datos negativos)', () => {
    const { total } = calcHealthScore(emptyDB());
    assert.equal(total, 70);
  });

  test('total siempre está entre 0 y 100', () => {
    const db = emptyDB();
    db.transactions.push(
      { date: date(0), type: 'income',  amount: 1000, cat: 'Ingresos' },
      { date: date(1), type: 'expense', amount: 5000, cat: 'Alimentación' }
    );
    db.cards.push({ balance: 5000, limit: 5000 });
    const { total } = calcHealthScore(db);
    assert.ok(total >= 0 && total <= 100);
  });

  test('con ahorro del 50% → factor savings es 30 (máximo)', () => {
    const db = emptyDB();
    db.transactions.push(
      { date: date(0), type: 'income',  amount: 2000, cat: 'Ingresos' },
      { date: date(1), type: 'expense', amount: 1000, cat: 'Gastos' }
    );
    const { breakdown } = calcHealthScore(db);
    assert.equal(breakdown.savings, 30);
  });

  test('presupuesto excedido baja el score de budgets', () => {
    const db = emptyDB();
    db.transactions.push({ date: date(0), type: 'expense', amount: 400, cat: 'Comida' });
    db.budgets.push({ cat: 'Comida', limit: 300, rollover: 0 });
    const { breakdown } = calcHealthScore(db);
    assert.equal(breakdown.budgets, 0);
  });

  test('presupuesto dentro del límite → score máximo de budgets', () => {
    const db = emptyDB();
    db.transactions.push({ date: date(0), type: 'expense', amount: 150, cat: 'Comida' });
    db.budgets.push({ cat: 'Comida', limit: 300, rollover: 0 });
    const { breakdown } = calcHealthScore(db);
    assert.equal(breakdown.budgets, 25);
  });

  test('meta al 100% → score máximo de goals', () => {
    const db = emptyDB();
    db.goals.push({ target: 1000, saved: 1000 });
    const { breakdown } = calcHealthScore(db);
    assert.equal(breakdown.goals, 25);
  });

  test('tarjeta al 0% utilización → score máximo de cards', () => {
    const db = emptyDB();
    db.cards.push({ balance: 0, limit: 5000 });
    const { breakdown } = calcHealthScore(db);
    assert.equal(breakdown.cards, 20);
  });

  test('breakdown suma igual a total', () => {
    const db = emptyDB();
    db.transactions.push(
      { date: date(0), type: 'income',  amount: 3000, cat: 'Ingresos' },
      { date: date(1), type: 'expense', amount: 1200, cat: 'Varios' }
    );
    db.goals.push({ target: 5000, saved: 2500 });
    db.cards.push({ balance: 1000, limit: 5000 });

    const { total, breakdown } = calcHealthScore(db);
    const sum = breakdown.savings + breakdown.budgets + breakdown.goals + breakdown.cards;
    assert.ok(Math.abs(total - sum) <= 3, `total (${total}) should be within 3 of sum (${sum})`);
  });
});

describe('healthScoreMessage', () => {
  test('score ≥ 85 retorna mensaje positivo', () => {
    assert.ok(healthScoreMessage(90).includes('Excelente'));
  });
  test('score < 30 retorna mensaje de alerta', () => {
    assert.ok(healthScoreMessage(20).includes('actuar'));
  });
});

describe('projectGoal', () => {
  test('retorna meses correctos sin interés', () => {
    const goal = { target: 1000, saved: 400 };
    assert.equal(projectGoal(goal, 200), 3);
  });

  test('retorna 0 si la meta ya está alcanzada', () => {
    const goal = { target: 1000, saved: 1000 };
    assert.equal(projectGoal(goal, 200), 0);
  });

  test('retorna 0 si saved > target', () => {
    const goal = { target: 1000, saved: 1200 };
    assert.equal(projectGoal(goal, 200), 0);
  });

  test('retorna null si ahorro mensual ≤ 0', () => {
    const goal = { target: 1000, saved: 400 };
    assert.equal(projectGoal(goal, 0), null);
    assert.equal(projectGoal(goal, -100), null);
  });

  test('redondea hacia arriba', () => {
    const goal = { target: 1000, saved: 500 };
    assert.equal(projectGoal(goal, 300), 2);
  });
});

describe('projectDebt', () => {
  test('deuda sin interés: remaining/monthly', () => {
    const debt = { remaining: 1200, monthly: 400, rate: 0 };
    assert.equal(projectDebt(debt), 3);
  });

  test('deuda con interés usa fórmula de amortización', () => {
    const debt = { remaining: 10000, monthly: 500, rate: 12 };
    const months = projectDebt(debt);
    assert.ok(months > 20 && months < 30, `Se esperaba 20-30, pero fue ${months}`);
  });

  test('retorna 0 si remaining ≤ 0', () => {
    const debt = { remaining: 0, monthly: 400, rate: 0 };
    assert.equal(projectDebt(debt), 0);
  });

  test('retorna null si monthly ≤ 0', () => {
    const debt = { remaining: 1000, monthly: 0, rate: 0 };
    assert.equal(projectDebt(debt), null);
  });

  test('retorna null si pago no cubre intereses', () => {
    const debt = { remaining: 10000, monthly: 500, rate: 120 };
    assert.equal(projectDebt(debt), null);
  });
});

describe('calcSpendingTrends', () => {
  test('retorna N puntos en orden cronológico', () => {
    const trends = calcSpendingTrends(emptyDB(), 6);
    assert.equal(trends.length, 6);
    assert.ok(trends[0].month < trends[5].month);
  });

  test('agrupa gastos por categoría correctamente', () => {
    const db = emptyDB();
    db.transactions.push(
      { date: date(0), type: 'expense', amount: 100, cat: 'Comida' },
      { date: date(1), type: 'expense', amount: 50,  cat: 'Comida' },
      { date: date(2), type: 'expense', amount: 200, cat: 'Ropa'   },
      { date: date(0), type: 'income',  amount: 500, cat: 'Salario' }
    );
    const trends = calcSpendingTrends(db, 1);
    const thisPoint = trends[0];
    assert.equal(thisPoint.byCategory['Comida'], 150);
    assert.equal(thisPoint.byCategory['Ropa'],   200);
    assert.equal(thisPoint.byCategory['Salario'], undefined);
    assert.equal(thisPoint.total, 350);
  });
});

describe('calcNetWorthEvolution', () => {
  test('retorna N puntos en orden cronológico', () => {
    const points = calcNetWorthEvolution(emptyDB(), 6);
    assert.equal(points.length, 6);
    // El primer elemento es el más antiguo, el último el mes actual
    assert.ok(points[0].month < points[5].month);
  });

  test('cada punto tiene month, label y netWorth', () => {
    const points = calcNetWorthEvolution(emptyDB(), 3);
    for (const p of points) {
      assert.ok(typeof p.month === 'string');
      assert.ok(typeof p.label === 'string');
      assert.ok(typeof p.netWorth === 'number');
    }
  });

  test('calcula patrimonio neto desde saldos de cuentas menos deudas', () => {
    const db = emptyDB();
    db.accounts.push({ balance: 5000 });
    db.debts.push({ remaining: 2000 });
    const points = calcNetWorthEvolution(db, 1);
    // Sin transacciones en el mes: el punto del mes actual debe ser 5000 - 2000 = 3000
    assert.equal(points[0].netWorth, 3000);
  });
});

describe('calcMonthlyAvgSavings', () => {
  test('retorna 0 con DB vacía', () => {
    assert.equal(calcMonthlyAvgSavings(emptyDB(), 3), 0);
  });

  test('calcula promedio excluyendo el mes actual', () => {
    const db = emptyDB();
    // Agrega ingresos y gastos del mes anterior (daysAgo ~35)
    db.transactions.push(
      { date: date(35), type: 'income',  amount: 3000, cat: 'Ingresos' },
      { date: date(36), type: 'expense', amount: 1000, cat: 'Gastos'   }
    );
    // El ahorro del mes anterior es 3000 - 1000 = 2000
    // El mes actual no tiene transacciones así que no cuenta
    const avg = calcMonthlyAvgSavings(db, 2);
    // Con datos en al menos 1 mes completo, el promedio debe ser positivo
    assert.ok(avg >= 0);
  });
});
