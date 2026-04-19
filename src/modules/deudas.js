// src/modules/deudas.js
// Deudas: proyección de pago y simulador de pago extra.

function render() {
  MF.nav.setFabAction(_openAddModal);

  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  var container = document.getElementById('view-deudas');
  if (!container) return;

  if (!db.debts.length) {
    container.textContent = '';
    container.insertAdjacentHTML('beforeend',
      '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.deudas + '</div>'
      + '<div class="empty-state__text">Sin deudas registradas. \u00a1Excelente!</div></div>');
    return;
  }

  var totalDebt = db.debts.reduce(function(s, d) { return s + (d.remaining || 0); }, 0);
  var cardsHTML = db.debts.map(function(d) { return _debtCardHTML(d, cur); }).join('');

  var viewHTML = '<div style="max-width:700px">'
    + '<div class="card" style="margin-bottom:20px">'
    + '<div class="card-title">Total adeudado</div>'
    + '<div class="card-value" style="margin-top:8px;color:var(--expense)">' + MF.nav.esc(MF.nav.formatCurrency(totalDebt, cur)) + '</div>'
    + '</div>'
    + '<div id="deudas-list">' + cardsHTML + '</div>'
    + '</div>';

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  document.getElementById('deudas-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id     = btn.dataset.id;
    if (action === 'edit-debt')      _openAddModal(id);
    else if (action === 'del-debt')  _deleteDebt(id);
    else if (action === 'sim-debt')  _openSimulatorModal(id);
    else if (action === 'pay-debt')  _openPaymentModal(id);
  });
}

function _debtCardHTML(d, cur) {
  var pct      = d.total > 0 ? Math.min(((d.total - d.remaining) / d.total) * 100, 100) : 0;
  var months   = MF.analytics.projectDebt(d);
  var color    = d.color || '#f7768e';
  var typeLabel = d.type === 'credit' ? 'Tarjeta' : 'Pr\u00e9stamo';

  var projLabel = '';
  if (d.remaining <= 0) {
    projLabel = '<span style="color:var(--income)">' + MF.icons.check + ' Saldada</span>';
  } else if (months !== null) {
    projLabel = '<span style="color:var(--text3)">~' + months + ' mes' + (months !== 1 ? 'es' : '') + ' para saldar</span>';
  } else {
    projLabel = '<span style="color:var(--warning)">Pago insuficiente para cubrir intereses</span>';
  }

  return '<div class="card" style="margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    + '<div style="width:36px;height:36px;border-radius:50%;background:' + MF.nav.esc(color) + ';display:flex;align-items:center;justify-content:center">' + MF.icons.deudas + '</div>'
    + '<div style="flex:1">'
    + '<div style="font-weight:500">' + MF.nav.esc(d.name) + '</div>'
    + '<div style="font-size:12px;color:var(--text3)">' + MF.nav.esc(typeLabel) + ' \u00b7 ' + MF.nav.esc(String(d.rate || 0)) + '% anual</div>'
    + '</div>'
    + '<div style="text-align:right">'
    + '<div class="amount text-expense">' + MF.nav.esc(MF.nav.formatCurrency(d.remaining, cur)) + '</div>'
    + '<div style="font-size:11px;color:var(--text3)">de ' + MF.nav.esc(MF.nav.formatCurrency(d.total, cur)) + '</div>'
    + '</div>'
    + '<div class="list-item__actions" style="opacity:1">'
    + '<button class="btn-icon" data-action="pay-debt"  data-id="' + MF.nav.esc(d.id) + '" title="Registrar pago">' + MF.icons.plus + '</button>'
    + '<button class="btn-icon" data-action="sim-debt"  data-id="' + MF.nav.esc(d.id) + '" title="Simular pago extra">' + MF.icons.simulator + '</button>'
    + '<button class="btn-icon" data-action="edit-debt" data-id="' + MF.nav.esc(d.id) + '" title="Editar">' + MF.icons.pencil + '</button>'
    + '<button class="btn-icon" data-action="del-debt"  data-id="' + MF.nav.esc(d.id) + '" title="Eliminar">' + MF.icons.trash + '</button>'
    + '</div></div>'
    + '<div class="progress-bar" style="height:8px">'
    + '<div class="progress-bar__fill" style="width:' + pct.toFixed(1) + '%;background:' + MF.nav.esc(color) + '"></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">'
    + '<div>' + projLabel + '</div>'
    + '<span style="color:var(--text3)">Pago mensual: ' + MF.nav.esc(MF.nav.formatCurrency(d.monthly, cur)) + '</span>'
    + '</div></div>';
}

function _openSimulatorModal(id) {
  var db   = MF.db.loadData();
  var debt = db.debts.find(function(d) { return d.id === id; });
  if (!debt) return;

  var cur         = (db.settings && db.settings.currency) || '$';
  var baseMonths  = MF.analytics.projectDebt(debt);

  var formHTML = '<p style="color:var(--text2);margin-bottom:12px">Deuda: <strong>' + MF.nav.esc(debt.name) + '</strong></p>'
    + '<p style="font-size:13px;color:var(--text3);margin-bottom:12px">Meses actuales: <strong>' + (baseMonths !== null ? baseMonths : 'N/A') + '</strong></p>'
    + '<div class="form-group"><label class="form-label">Pago extra mensual</label>'
    + '<input class="form-input" id="sim-extra" type="number" step="0.01" min="0" placeholder="0.00"></div>'
    + '<div id="sim-result" style="margin-top:12px;font-size:14px;color:var(--text2)"></div>';

  MF.nav.showModal(formHTML, 'Simular pago extra', [
    { label: 'Cerrar', action: MF.nav.closeModal }
  ]);

  document.getElementById('sim-extra')?.addEventListener('input', function(e) {
    var extra   = parseFloat(e.target.value) || 0;
    var simDebt = Object.assign({}, debt, { monthly: (debt.monthly || 0) + extra });
    var months  = MF.analytics.projectDebt(simDebt);
    var result  = document.getElementById('sim-result');
    if (!result) return;

    if (months === null) {
      result.textContent = '';
      result.insertAdjacentHTML('beforeend', '<span style="color:var(--warning)">El pago a\u00fan no cubre los intereses.</span>');
    } else if (baseMonths !== null && months < baseMonths) {
      var saved = baseMonths - months;
      result.textContent = '';
      result.insertAdjacentHTML('beforeend',
        MF.icons.check + ' Con ' + MF.nav.esc(MF.nav.formatCurrency(extra, cur)) + ' extra: <strong style="color:var(--income)">'
        + months + ' meses</strong> \u2014 ahorras ' + saved + ' mes' + (saved !== 1 ? 'es' : ''));
    } else {
      result.textContent = months !== null ? months + ' meses' : '';
    }
  });
}

function _openPaymentModal(id) {
  var db   = MF.db.loadData();
  var debt = db.debts.find(function(d) { return d.id === id; });
  if (!debt) return;

  var cur     = (db.settings && db.settings.currency) || '$';
  var formHTML = '<p style="color:var(--text2);margin-bottom:12px">Deuda: <strong>' + MF.nav.esc(debt.name) + '</strong></p>'
    + '<p style="font-size:13px;color:var(--text3);margin-bottom:12px">Saldo: ' + MF.nav.esc(MF.nav.formatCurrency(debt.remaining, cur)) + '</p>'
    + '<div class="form-group"><label class="form-label">Monto pagado</label>'
    + '<input class="form-input" id="pay-amount" type="number" step="0.01" min="0.01" value="' + (debt.monthly || '') + '"></div>';

  MF.nav.showModal(formHTML, 'Registrar pago', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Registrar', primary: true, action: function() {
      var amount = parseFloat((document.getElementById('pay-amount') || {}).value);
      if (!amount || amount <= 0) { MF.nav.toast('Monto inv\u00e1lido', 'error'); return; }
      var db2  = MF.db.loadData();
      var idx  = db2.debts.findIndex(function(d) { return d.id === id; });
      if (idx >= 0) {
        db2.debts[idx].remaining = Math.max((db2.debts[idx].remaining || 0) - amount, 0);
        db2.debts[idx].updatedAt = new Date().toISOString();
      }
      MF.db.saveData(db2);
      MF.nav.closeModal();
      MF.nav.toast('Pago registrado');
      render();
    }}
  ]);
}

function _openAddModal(id) {
  var db   = MF.db.loadData();
  var debt = id ? db.debts.find(function(d) { return d.id === id; }) : null;

  var formHTML = '<div class="form-group"><label class="form-label">Nombre</label>'
    + '<input class="form-input" id="debt-name" value="' + MF.nav.esc(debt ? debt.name : '') + '" placeholder="ej: Pr\u00e9stamo auto"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Tipo</label>'
    + '<select class="form-select" id="debt-type">'
    + '<option value="loan"' + (debt && debt.type === 'loan' ? ' selected' : '') + '>Pr\u00e9stamo</option>'
    + '<option value="credit"' + (debt && debt.type === 'credit' ? ' selected' : '') + '>Tarjeta</option>'
    + '</select></div>'
    + '<div class="form-group"><label class="form-label">Tasa anual (%)</label>'
    + '<input class="form-input" id="debt-rate" type="number" step="0.1" min="0" value="' + (debt ? debt.rate : 0) + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Total original</label>'
    + '<input class="form-input" id="debt-total" type="number" step="0.01" min="0" value="' + (debt ? debt.total : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Saldo restante</label>'
    + '<input class="form-input" id="debt-remaining" type="number" step="0.01" min="0" value="' + (debt ? debt.remaining : '') + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Pago mensual</label>'
    + '<input class="form-input" id="debt-monthly" type="number" step="0.01" min="0" value="' + (debt ? debt.monthly : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="debt-color" type="color" value="' + MF.nav.esc(debt ? debt.color : '#f7768e') + '" style="height:40px;padding:4px"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, debt ? 'Editar deuda' : 'Nueva deuda', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: debt ? 'Guardar' : 'Crear', primary: true, action: function() { _saveDebt(id); } }
  ]);
}

function _saveDebt(id) {
  var name      = ((document.getElementById('debt-name') || {}).value || '').trim();
  var type      = (document.getElementById('debt-type') || {}).value;
  var rate      = parseFloat((document.getElementById('debt-rate') || {}).value) || 0;
  var total     = parseFloat((document.getElementById('debt-total') || {}).value);
  var remaining = parseFloat((document.getElementById('debt-remaining') || {}).value);
  var monthly   = parseFloat((document.getElementById('debt-monthly') || {}).value);
  var color     = (document.getElementById('debt-color') || {}).value;

  if (!name || !total || !monthly) { MF.nav.toast('Completa todos los campos', 'error'); return; }

  var db  = MF.db.loadData();
  var now = new Date().toISOString();

  if (id) {
    var idx = db.debts.findIndex(function(d) { return d.id === id; });
    if (idx >= 0) db.debts[idx] = Object.assign({}, db.debts[idx], { name: name, type: type, rate: rate, total: total, remaining: remaining, monthly: monthly, color: color, updatedAt: now });
  } else {
    db.debts.push({ id: MF.db.generateId(), name: name, type: type, rate: rate, total: total, remaining: remaining || total, monthly: monthly, color: color, createdAt: now, updatedAt: now });
  }

  MF.db.saveData(db);
  MF.nav.closeModal();
  MF.nav.toast(id ? 'Deuda actualizada' : 'Deuda creada');
  render();
}

function _deleteDebt(id) {
  MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar esta deuda?</p>', 'Eliminar deuda', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Eliminar', danger: true, action: function() {
      var db = MF.db.loadData();
      db.debts = db.debts.filter(function(d) { return d.id !== id; });
      MF.db.saveData(db);
      MF.nav.closeModal();
      MF.nav.toast('Deuda eliminada');
      render();
    }}
  ]);
}

var _deudasAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.deudas = _deudasAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _deudasAPI; }
