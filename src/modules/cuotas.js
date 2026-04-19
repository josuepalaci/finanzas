// src/modules/cuotas.js
// Compras a cuotas en tarjeta de crédito.

function render() {
  MF.nav.setFabAction(_openAddModal);
  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  var cardNames = {};
  db.cards.forEach(function(c) { cardNames[c.id] = c.name; });

  var container = document.getElementById('view-cuotas');
  if (!container) return;

  if (!db.installments.length) {
    container.textContent = '';
    container.insertAdjacentHTML('beforeend', '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.cuotas + '</div><div class="empty-state__text">Sin cuotas registradas</div></div>');
    return;
  }

  var listHTML = db.installments.map(function(inst) {
    var remaining = Math.max(inst.cuotas - inst.paid, 0);
    var pct       = inst.cuotas > 0 ? Math.min((inst.paid / inst.cuotas) * 100, 100) : 0;
    var remainAmt = remaining * (inst.cuotaAmt || 0);

    return '<div class="card" style="margin-bottom:12px">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
      + '<div class="list-item__content">'
      + '<div style="font-weight:500">' + MF.nav.esc(inst.desc) + '</div>'
      + '<div style="font-size:12px;color:var(--text3)">' + MF.nav.esc(cardNames[inst.card] || inst.card) + ' \u00b7 ' + MF.nav.esc(inst.cat || '') + '</div>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<div class="amount">' + MF.nav.esc(String(inst.paid)) + '/' + MF.nav.esc(String(inst.cuotas)) + ' cuotas</div>'
      + '<div style="font-size:11px;color:var(--text3)">Resta: ' + MF.nav.esc(MF.nav.formatCurrency(remainAmt, cur)) + '</div>'
      + '</div>'
      + '<div class="list-item__actions" style="opacity:1">'
      + '<button class="btn-icon" data-action="pay-inst"  data-id="' + MF.nav.esc(inst.id) + '" title="Registrar pago">' + MF.icons.plus + '</button>'
      + '<button class="btn-icon" data-action="edit-inst" data-id="' + MF.nav.esc(inst.id) + '">' + MF.icons.pencil + '</button>'
      + '<button class="btn-icon" data-action="del-inst"  data-id="' + MF.nav.esc(inst.id) + '">' + MF.icons.trash + '</button>'
      + '</div></div>'
      + '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct.toFixed(1) + '%"></div></div>'
      + '</div>';
  }).join('');

  container.textContent = '';
  container.insertAdjacentHTML('beforeend', '<div style="max-width:700px"><h2 style="margin-bottom:16px">Cuotas</h2><div id="cuotas-list">' + listHTML + '</div></div>');

  document.getElementById('cuotas-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action; var id = btn.dataset.id;
    if (action === 'edit-inst') _openAddModal(id);
    else if (action === 'del-inst') {
      MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar esta cuota?</p>', 'Eliminar', [
        { label: 'Cancelar', action: MF.nav.closeModal },
        { label: 'Eliminar', danger: true, action: function() {
          var db2 = MF.db.loadData();
          db2.installments = db2.installments.filter(function(i) { return i.id !== id; });
          MF.db.saveData(db2); MF.nav.closeModal(); MF.nav.toast('Cuota eliminada'); render();
        }}
      ]);
    } else if (action === 'pay-inst') {
      var db2 = MF.db.loadData();
      var idx = db2.installments.findIndex(function(i) { return i.id === id; });
      if (idx >= 0 && db2.installments[idx].paid < db2.installments[idx].cuotas) {
        db2.installments[idx].paid += 1;
        db2.installments[idx].updatedAt = new Date().toISOString();
        MF.db.saveData(db2); MF.nav.toast('Cuota pagada'); render();
      }
    }
  });
}

function _openAddModal(id) {
  var db   = MF.db.loadData();
  var inst = id ? db.installments.find(function(i) { return i.id === id; }) : null;
  var today = new Date().toISOString().slice(0, 10);
  var cardOpts = db.cards.map(function(c) {
    return '<option value="' + MF.nav.esc(c.id) + '"' + (inst && inst.card === c.id ? ' selected' : '') + '>' + MF.nav.esc(c.name) + '</option>';
  }).join('');
  var defaultCats = ['Ropa','Electr\u00f3nicos','Hogar','Viajes','Salud','Educaci\u00f3n','Otro'];
  var catOpts = defaultCats.map(function(c) {
    return '<option value="' + MF.nav.esc(c) + '"' + (inst && inst.cat === c ? ' selected' : '') + '>' + MF.nav.esc(c) + '</option>';
  }).join('');

  var formHTML = '<div class="form-group"><label class="form-label">Descripci\u00f3n</label>'
    + '<input class="form-input" id="inst-desc" value="' + MF.nav.esc(inst ? inst.desc : '') + '" placeholder="ej: Laptop"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Tarjeta</label><select class="form-select" id="inst-card">' + cardOpts + '</select></div>'
    + '<div class="form-group"><label class="form-label">Categor\u00eda</label><select class="form-select" id="inst-cat">' + catOpts + '</select></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Total</label><input class="form-input" id="inst-total" type="number" step="0.01" min="0" value="' + (inst ? inst.total : '') + '"></div>'
    + '<div class="form-group"><label class="form-label">N\u00famero de cuotas</label><input class="form-input" id="inst-cuotas" type="number" min="1" value="' + (inst ? inst.cuotas : 12) + '"></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Cuotas pagadas</label><input class="form-input" id="inst-paid" type="number" min="0" value="' + (inst ? inst.paid : 0) + '"></div>'
    + '<div class="form-group"><label class="form-label">Fecha inicio</label><input class="form-input" id="inst-start" type="date" value="' + MF.nav.esc(inst ? inst.startDate : today) + '"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, inst ? 'Editar cuota' : 'Nueva cuota', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: inst ? 'Guardar' : 'Crear', primary: true, action: function() {
      var desc      = ((document.getElementById('inst-desc') || {}).value || '').trim();
      var card      = (document.getElementById('inst-card') || {}).value;
      var cat       = (document.getElementById('inst-cat') || {}).value;
      var total     = parseFloat((document.getElementById('inst-total') || {}).value);
      var cuotas    = parseInt((document.getElementById('inst-cuotas') || {}).value);
      var paid      = parseInt((document.getElementById('inst-paid') || {}).value) || 0;
      var startDate = (document.getElementById('inst-start') || {}).value;
      if (!desc || !total || !cuotas) { MF.nav.toast('Completa los campos requeridos', 'error'); return; }
      var cuotaAmt  = total / cuotas;
      var db2 = MF.db.loadData(); var now = new Date().toISOString();
      if (id) {
        var idx = db2.installments.findIndex(function(i) { return i.id === id; });
        if (idx >= 0) db2.installments[idx] = Object.assign({}, db2.installments[idx], { desc: desc, card: card, cat: cat, total: total, cuotas: cuotas, paid: paid, cuotaAmt: cuotaAmt, startDate: startDate, updatedAt: now });
      } else {
        db2.installments.push({ id: MF.db.generateId(), desc: desc, card: card, cat: cat, total: total, cuotas: cuotas, paid: paid, cuotaAmt: cuotaAmt, startDate: startDate, createdAt: now, updatedAt: now });
      }
      MF.db.saveData(db2); MF.nav.closeModal(); MF.nav.toast(id ? 'Cuota actualizada' : 'Cuota creada'); render();
    }}
  ]);
}

var _cuotasAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.cuotas = _cuotasAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _cuotasAPI; }
