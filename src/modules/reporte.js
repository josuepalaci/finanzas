// src/modules/reporte.js
// Reporte mensual: resumen + tendencias por categoría + evolución patrimonio.

var _trendsChart   = null;
var _networthChart = null;

function render() {
  MF.nav.setFabAction(null);

  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';
  var now = new Date();
  var month = now.toISOString().slice(0, 7);
  var monthLabel = now.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  var monthTxs = db.transactions.filter(function(t) { return t.date && t.date.startsWith(month); });
  var income   = monthTxs.filter(function(t) { return t.type === 'income'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var expenses = monthTxs.filter(function(t) { return t.type === 'expense'; }).reduce(function(s, t) { return s + t.amount; }, 0);
  var savings  = income - expenses;

  var trends    = MF.analytics.calcSpendingTrends(db, 6);
  var netWorth  = MF.analytics.calcNetWorthEvolution(db, 6);

  var byCat = {};
  monthTxs.filter(function(t) { return t.type === 'expense'; }).forEach(function(t) {
    var cat = t.cat || 'Sin categor\u00eda';
    byCat[cat] = (byCat[cat] || 0) + t.amount;
  });
  var topCats = Object.entries(byCat).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);

  var topCatsHTML = topCats.map(function(entry) {
    var pct = expenses > 0 ? ((entry[1] / expenses) * 100).toFixed(1) : '0';
    var color = MF.categorias.getCatColor(entry[0], db);
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:' + MF.nav.esc(color) + '"></div>'
      + '<span style="flex:1">' + MF.nav.esc(entry[0]) + '</span>'
      + '<span class="amount">' + MF.nav.esc(MF.nav.formatCurrency(entry[1], cur)) + '</span>'
      + '<span style="color:var(--text3);width:36px;text-align:right">' + MF.nav.esc(pct) + '%</span>'
      + '</div>';
  }).join('');

  var container = document.getElementById('view-reporte');
  if (!container) return;

  if (_trendsChart)   { _trendsChart.destroy();   _trendsChart   = null; }
  if (_networthChart) { _networthChart.destroy(); _networthChart = null; }

  var viewHTML = '<div style="max-width:900px">'
    + '<h2 style="margin-bottom:16px">Reporte \u2014 ' + MF.nav.esc(monthLabel) + '</h2>'
    + '<div class="card-grid" style="margin-bottom:20px">'
    + _metricHTML('Ingresos', MF.nav.formatCurrency(income, cur), 'color:var(--income)')
    + _metricHTML('Gastos',   MF.nav.formatCurrency(expenses, cur), 'color:var(--expense)')
    + _metricHTML('Ahorro',   MF.nav.formatCurrency(savings, cur),  savings >= 0 ? 'color:var(--income)' : 'color:var(--expense)')
    + (function() { var lnw = netWorth.length > 0 ? netWorth[netWorth.length - 1].netWorth : 0; return _metricHTML('Patrimonio', MF.nav.formatCurrency(lnw, cur), lnw >= 0 ? 'color:var(--income)' : 'color:var(--expense)'); })()
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">'
    + '<div class="card"><div class="card-header"><span class="card-title">Top categor\u00edas del mes</span></div>'
    + (topCatsHTML || '<p style="color:var(--text3);font-size:13px">Sin gastos este mes.</p>') + '</div>'
    + '<div class="card"><div class="card-header"><span class="card-title">Patrimonio neto \u2014 6 meses</span></div>'
    + '<canvas id="chart-rpt-networth" style="max-height:160px"></canvas></div>'
    + '</div>'
    + '<div class="card"><div class="card-header"><span class="card-title">Tendencia de gastos por categor\u00eda \u2014 6 meses</span></div>'
    + '<canvas id="chart-rpt-trends" style="max-height:200px"></canvas></div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  _renderTrends(trends, db);
  _renderNetworth(netWorth, cur);
}

function _metricHTML(label, value, style) {
  return '<div class="card">'
    + '<div class="card-title">' + MF.nav.esc(label) + '</div>'
    + '<div class="card-value" style="margin-top:8px;font-size:18px;' + style + '">' + MF.nav.esc(value) + '</div>'
    + '</div>';
}

function _textColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text2').trim() || '#a9b1d6';
}

function _renderTrends(trends, db) {
  var canvas = document.getElementById('chart-rpt-trends');
  if (!canvas || typeof Chart === 'undefined') return;

  var totalByCat = {};
  trends.forEach(function(point) {
    Object.entries(point.byCategory).forEach(function(e) {
      totalByCat[e[0]] = (totalByCat[e[0]] || 0) + e[1];
    });
  });
  var topCats = Object.entries(totalByCat).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 4).map(function(e) { return e[0]; });

  var CHART_COLORS = ['#7aa2f7','#bb9af7','#ff9e64','#f7768e'];
  var textColor = _textColor();

  var datasets = topCats.map(function(cat, i) {
    return {
      label: cat,
      data: trends.map(function(p) { return p.byCategory[cat] || 0; }),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '22',
      tension: 0.3,
      fill: false,
      pointRadius: 3
    };
  });

  _trendsChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: trends.map(function(p) { return p.label; }), datasets: datasets },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, padding: 8, font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      maintainAspectRatio: true
    }
  });
}

function _renderNetworth(points, cur) {
  var canvas = document.getElementById('chart-rpt-networth');
  if (!canvas || typeof Chart === 'undefined') return;
  var textColor   = _textColor();
  var accentColor = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#7aa2f7';

  _networthChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: points.map(function(p) { return p.label; }),
      datasets: [{
        data: points.map(function(p) { return p.netWorth; }),
        borderColor: accentColor, backgroundColor: accentColor + '22',
        fill: true, tension: 0.4, pointRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: textColor, font: { size: 10 }, callback: function(v) { return MF.nav.formatCurrency(v, cur); } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      maintainAspectRatio: true
    }
  });
}

var _reporteAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.reporte = _reporteAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _reporteAPI; }
