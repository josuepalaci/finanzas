// src/modules/dashboard.js
// Vista Dashboard: métricas, health score, donut de gastos, evolución patrimonio.

const CAT_COLORS = {
  'Alimentación': '#7aa2f7', 'Transporte': '#ff9e64',
  'Entretenimiento': '#bb9af7', 'Salud': '#9ece6a',
  'Servicios': '#f7768e', 'Ropa': '#73daca',
  'Ingresos': '#9ece6a', 'Sin categoría': '#565f89'
};

// ── Instancias de Chart.js ──────────────────────────────────────────────────
let _donutChart    = null;
let _netWorthChart = null;

function _destroyCharts() {
  if (_donutChart)    { _donutChart.destroy();    _donutChart    = null; }
  if (_netWorthChart) { _netWorthChart.destroy(); _netWorthChart = null; }
}

// ── render ──────────────────────────────────────────────────────────────────

function render() {
  MF.nav.setFabAction(null); // Dashboard no agrega nada con FAB

  const db       = MF.db.loadData();
  const now      = new Date();
  const month    = now.toISOString().slice(0, 7);
  const cur      = (db.settings && db.settings.currency) || '$';

  const monthTxs = db.transactions.filter(t => t.date && t.date.startsWith(month));
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const savings  = income - expenses;
  const totalBalance = db.accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const score        = MF.analytics.calcHealthScore(db);
  const netWorthData = MF.analytics.calcNetWorthEvolution(db, 6);

  const container = document.getElementById('view-dashboard');
  if (!container) return;

  _destroyCharts();

  const isMobile   = window.innerWidth < 480;
  const isLarge    = window.innerWidth >= 1024;
  const dateLabel  = now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const monthLabel = now.toLocaleDateString('es', { month: 'long' });
  const savingsColor = savings >= 0 ? 'var(--income)' : 'var(--expense)';

  const scoreLines = [
    ['Ahorro',       score.breakdown.savings, 30],
    ['Presupuestos', score.breakdown.budgets, 25],
    ['Metas',        score.breakdown.goals,   25],
    ['Tarjetas',     score.breakdown.cards,   20]
  ].map(row => {
    const pct = Math.round((row[1] / row[2]) * 100);
    return '<div class="health-score__bar-row">'
      + '<span class="health-score__bar-label">' + MF.nav.esc(row[0]) + '</span>'
      + '<div class="progress-bar" style="flex:1"><div class="progress-bar__fill" style="width:' + pct + '%;background:var(--accent)"></div></div>'
      + '<span style="min-width:24px;text-align:right;color:var(--text2)">' + row[1] + '</span>'
      + '</div>';
  }).join('');

  const viewHTML = '<div class="dash-container">'
    + '<div style="margin-bottom:8px;font-size:12px;color:var(--text3)">' + MF.nav.esc(dateLabel) + '</div>'
    + '<div class="card-grid dash-metric-grid">'
    + _metricCardHTML('Balance total',     MF.nav.formatCurrency(totalBalance, cur), '')
    + _metricCardHTML('Ingresos del mes',  MF.nav.formatCurrency(income,        cur), 'color:var(--income)')
    + _metricCardHTML('Gastos del mes',    MF.nav.formatCurrency(expenses,      cur), 'color:var(--expense)')
    + _metricCardHTML('Ahorro',            MF.nav.formatCurrency(savings,       cur), 'color:' + savingsColor)
    + '</div>'
    + '<div class="dash-charts-grid">'
    + '<div class="card">'
    + '<div class="card-header"><span class="card-title">Salud financiera</span></div>'
    + '<div class="health-score">'
    + '<div style="display:flex;align-items:baseline;gap:6px">'
    + '<div class="health-score__number">' + score.total + '</div>'
    + '<div class="health-score__label">/ 100</div>'
    + '</div>'
    + '<div class="health-score__bar">' + scoreLines + '</div>'
    + '<div class="health-score__message">' + MF.nav.esc(MF.analytics.healthScoreMessage(score.total)) + '</div>'
    + '</div></div>'
    + '<div class="card">'
    + '<div class="card-header"><span class="card-title">Gastos por categor\u00eda</span>'
    + '<span style="font-size:12px;color:var(--text3)">' + MF.nav.esc(monthLabel) + '</span></div>'
    + '<canvas id="chart-donut"></canvas>'
    + '</div>'
    + '<div class="card dash-networth-card">'
    + '<div class="card-header"><span class="card-title">Patrimonio neto \u2014 \u00faltimos 6 meses</span></div>'
    + '<canvas id="chart-networth"></canvas>'
    + '</div>'
    + '</div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  _renderDonut(db, monthTxs, isMobile, isLarge);
  _renderNetWorth(netWorthData, cur, isMobile, isLarge);
}

function _metricCardHTML(label, value, style) {
  return '<div class="card" style="padding:12px 14px">'
    + '<div class="card-title" style="font-size:11px">' + MF.nav.esc(label) + '</div>'
    + '<div class="card-value" style="margin-top:6px;font-size:18px;' + style + '">' + MF.nav.esc(value) + '</div>'
    + '</div>';
}

// ── Charts ──────────────────────────────────────────────────────────────────

function _textColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text2').trim() || '#a9b1d6';
}

function _renderDonut(db, monthTxs, isMobile, isLarge) {
  const canvas = document.getElementById('chart-donut');
  if (!canvas || typeof Chart === 'undefined') return;

  const byCategory = {};
  monthTxs.filter(t => t.type === 'expense').forEach(tx => {
    const cat = tx.cat || 'Sin categoría';
    byCategory[cat] = (byCategory[cat] || 0) + tx.amount;
  });

  const maxEntries = isMobile ? 5 : 8;
  const entries   = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, maxEntries);
  const labels    = entries.map(e => e[0]);
  const data      = entries.map(e => e[1]);
  const colors    = labels.map(cat => MF.categorias.getCatColor(cat, db));
  const textColor = _textColor();
  const cur       = (db.settings && db.settings.currency) || '$';

  _donutChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: 'var(--bg2)' }]
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            boxWidth: isMobile ? 8 : 10,
            padding: isMobile ? 6 : 10,
            font: { size: isMobile ? 10 : 11 }
          }
        },
        tooltip: { callbacks: { label: ctx => ' ' + MF.nav.formatCurrency(ctx.parsed, cur) } }
      },
      cutout: '60%',
      maintainAspectRatio: true,
      aspectRatio: isMobile ? 1.4 : isLarge ? 1.2 : 1.6
    }
  });
}

function _renderNetWorth(points, cur, isMobile, isLarge) {
  const canvas = document.getElementById('chart-networth');
  if (!canvas || typeof Chart === 'undefined') return;

  const textColor   = _textColor();
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#7aa2f7';

  _netWorthChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: points.map(p => p.label),
      datasets: [{
        data: points.map(p => p.netWorth),
        borderColor: accentColor,
        backgroundColor: accentColor + '22',
        fill: true,
        tension: 0.4,
        pointRadius: isMobile ? 3 : 4,
        pointBackgroundColor: accentColor
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            maxTicksLimit: isMobile ? 4 : 5,
            callback: v => {
              const abs = Math.abs(v);
              if (abs >= 1000) return (v / 1000).toFixed(1) + 'k';
              return String(v);
            }
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      },
      maintainAspectRatio: true,
      aspectRatio: isMobile ? 2.5 : isLarge ? 1.8 : 3.5
    }
  });
}

// ── Exports ─────────────────────────────────────────────────────────────────

const _dashboardAPI = { render };

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.dashboard = _dashboardAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _dashboardAPI;
}
