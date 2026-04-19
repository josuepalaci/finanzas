// src/modules/analytics.js
// Cálculos de análisis financiero: health score, tendencias, proyecciones.

function calcHealthScore(db) {
  const now   = new Date();
  const month = now.toISOString().slice(0, 7);

  const monthTxs  = (db.transactions || []).filter(t => t.date && t.date.startsWith(month));
  const income    = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const expenses  = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

  const savingsRate  = income > 0 ? Math.max(0, (income - expenses) / income) : 0;
  const savingsScore = Math.min(savingsRate * 2, 1) * 30;

  let budgetsScore = 25;
  if ((db.budgets || []).length > 0) {
    const ok = db.budgets.filter(b => {
      const spent = monthTxs
        .filter(t => t.cat === b.cat && t.type === 'expense')
        .reduce((s, t) => s + (t.amount || 0), 0);
      return spent <= (b.limit || 0) + (b.rollover || 0);
    }).length;
    budgetsScore = (ok / db.budgets.length) * 25;
  }

  let goalsScore = 25;
  if ((db.goals || []).length > 0) {
    const avgProgress = db.goals.reduce((s, g) => {
      return s + Math.min((g.saved || 0) / Math.max(g.target || 1, 1), 1);
    }, 0) / db.goals.length;
    goalsScore = avgProgress * 25;
  }

  let cardScore = 20;
  if ((db.cards || []).length > 0) {
    const avgUtil = db.cards.reduce((s, c) => {
      return s + (c.balance || 0) / Math.max(c.limit || 1, 1);
    }, 0) / db.cards.length;
    cardScore = Math.max(0, 1 - avgUtil) * 20;
  }

  const total = Math.round(savingsScore + budgetsScore + goalsScore + cardScore);

  return {
    total: Math.min(100, Math.max(0, total)),
    breakdown: {
      savings: Math.round(savingsScore),
      budgets: Math.round(budgetsScore),
      goals:   Math.round(goalsScore),
      cards:   Math.round(cardScore)
    }
  };
}

function healthScoreMessage(score) {
  if (score >= 85) return 'Excelentes finanzas — sigue así.';
  if (score >= 70) return 'Buena salud financiera — hay espacio para mejorar.';
  if (score >= 50) return 'Finanzas moderadas — revisa tus presupuestos.';
  if (score >= 30) return 'Atención — algunos indicadores necesitan trabajo.';
  return 'Momento de actuar — revisa tus gastos y metas.';
}

function calcSpendingTrends(db, months) {
  months = months || 6;
  const result = [];
  const now    = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' });

    const txs        = (db.transactions || []).filter(t => t.date && t.date.startsWith(month) && t.type === 'expense');
    const byCategory = {};
    for (const tx of txs) {
      byCategory[tx.cat || 'Sin categoría'] = (byCategory[tx.cat || 'Sin categoría'] || 0) + (tx.amount || 0);
    }
    const total = txs.reduce((s, t) => s + (t.amount || 0), 0);

    result.push({ month, label, byCategory, total });
  }

  return result;
}

function calcNetWorthEvolution(db, months) {
  months = months || 6;
  const now = new Date();

  const currentAssets = (db.accounts || []).reduce((s, a) => s + (a.balance || 0), 0);
  const currentDebts  = (db.debts   || []).reduce((s, d) => s + (d.remaining || 0), 0)
                      + (db.cards   || []).reduce((s, c) => s + (c.balance   || 0), 0);

  let netWorth = currentAssets - currentDebts;
  const points = [];

  for (let i = 0; i < months; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' });

    const txs     = (db.transactions || []).filter(t => t.date && t.date.startsWith(month));
    const income  = txs.filter(t => t.type === 'income').reduce((s, t)  => s + (t.amount || 0), 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

    points.unshift({ month, label, netWorth: Math.round(netWorth) });

    netWorth = netWorth - income + expense;
  }

  return points;
}

function projectGoal(goal, monthlySavings) {
  const remaining = (goal.target || 0) - (goal.saved || 0);
  if (remaining <= 0) return 0;
  if (monthlySavings <= 0) return null;
  return Math.ceil(remaining / monthlySavings);
}

function projectDebt(debt) {
  const remaining = debt.remaining || 0;
  const monthly   = debt.monthly   || 0;
  const rate      = debt.rate      || 0;

  if (remaining <= 0) return 0;
  if (monthly   <= 0) return null;

  if (rate > 0) {
    const r = rate / 100 / 12;
    const inner = 1 - (r * remaining / monthly);
    if (inner <= 0) return null;
    return Math.ceil(-Math.log(inner) / Math.log(1 + r));
  }

  return Math.ceil(remaining / monthly);
}

function calcMonthlyAvgSavings(db, months) {
  months = months || 3;
  const trends = calcSpendingTrends(db, months);

  const now      = new Date();
  const nowMonth = now.toISOString().slice(0, 7);

  let totalSavings = 0;
  let count        = 0;

  for (const point of trends) {
    if (point.month === nowMonth) continue;
    const txs    = (db.transactions || []).filter(t => t.date && t.date.startsWith(point.month));
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    totalSavings += income - point.total;
    count++;
  }

  return count > 0 ? totalSavings / count : 0;
}

const _analyticsAPI = {
  calcHealthScore,
  healthScoreMessage,
  calcSpendingTrends,
  calcNetWorthEvolution,
  projectGoal,
  projectDebt,
  calcMonthlyAvgSavings
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.analytics = _analyticsAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _analyticsAPI;
}
