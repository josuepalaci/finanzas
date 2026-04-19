// src/modules/transferencias.js
// Transferencias entre cuentas.

function render() {
  MF.nav.setFabAction(_openAddModal);
  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  var accountNames = {};
  db.accounts.forEach(function(a) { accountNames[a.id] = a.name; });

  var sorted = db.transfers.slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

  var listHTML = sorted.length ? sorted.map(function(t) {
    return '<div class="list-item">'
      + '<div class="list-item__icon" style="background:var(--bg3)">' + MF.icons.transferencias + '</div>'
      + '<div class="list-item__content">'
      + '<div class="list-item__title">' + MF.nav.esc(accountNames[t.from] || t.from) + ' \u2192 ' + MF.nav.esc(accountNames[t.to] || t.to) + '</div>'
      + '<div class="list-item__sub">' + MF.nav.esc(MF.nav.formatDate(t.date)) + (t.note ? ' \u00b7 ' + MF.nav.esc(t.note) : '') + '</div>'
      + '</div>'
      + '<div class="list-item__amount">' + MF.nav.esc(MF.nav.formatCurrency(t.amount, cur)) + '</div>'
      + '<div class="list-item__actions"><button class="btn-icon" data-action="del-transfer" data-id="' + MF.nav.esc(t.id) + '">' + MF.icons.trash + '</button></div>'
      + '</div>';
  }).join('')
  : '<div class="empty-state"><div class="empty-state__icon">' + MF.icons.transferencias + '</div><div class="empty-state__text">Sin transferencias</div></div>';

  var container = document.getElementById('view-transferencias');
  if (!container) return;
  container.textContent = '';
  container.insertAdjacentHTML('beforeend', '<div style="max-width:700px"><h2 style="margin-bottom:16px">Transferencias</h2><div id="trans-list">' + listHTML + '</div></div>');

  document.getElementById('trans-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action="del-transfer"]');
    if (!btn) return;
    var id = btn.dataset.id;
    MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar esta transferencia?</p>', 'Eliminar', [
      { label: 'Cancelar', action: MF.nav.closeModal },
      { label: 'Eliminar', danger: true, action: function() {
        var db2 = MF.db.loadData();
        db2.transfers = db2.transfers.filter(function(t) { return t.id !== id; });
        MF.db.saveData(db2);
        MF.nav.closeModal();
        MF.nav.toast('Transferencia eliminada');
        render();
      }}
    ]);
  });
}

function _openAddModal() {
  var db  = MF.db.loadData();
  var today = new Date().toISOString().slice(0, 10);
  var accOpts = db.accounts.map(function(a) {
    return '<option value="' + MF.nav.esc(a.id) + '">' + MF.nav.esc(a.name) + '</option>';
  }).join('');

  var formHTML = '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Desde</label><select class="form-select" id="tr-from">' + accOpts + '</select></div>'
    + '<div class="form-group"><label class="form-label">Hacia</label><select class="form-select" id="tr-to">' + accOpts + '</select></div>'
    + '</div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Monto</label><input class="form-input" id="tr-amount" type="number" step="0.01" min="0.01"></div>'
    + '<div class="form-group"><label class="form-label">Fecha</label><input class="form-input" id="tr-date" type="date" value="' + MF.nav.esc(today) + '"></div>'
    + '</div>'
    + '<div class="form-group"><label class="form-label">Nota (opcional)</label><input class="form-input" id="tr-note" placeholder="Motivo\u2026"></div>';

  MF.nav.showModal(formHTML, 'Nueva transferencia', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: 'Registrar', primary: true, action: function() {
      var from   = (document.getElementById('tr-from') || {}).value;
      var to     = (document.getElementById('tr-to') || {}).value;
      var amount = parseFloat((document.getElementById('tr-amount') || {}).value);
      var date   = (document.getElementById('tr-date') || {}).value;
      var note   = ((document.getElementById('tr-note') || {}).value || '').trim();
      if (from === to)           { MF.nav.toast('Las cuentas deben ser distintas', 'error'); return; }
      if (!amount || amount <= 0) { MF.nav.toast('Monto inv\u00e1lido', 'error'); return; }
      var db2 = MF.db.loadData(); var now = new Date().toISOString();
      db2.transfers.push({ id: MF.db.generateId(), from: from, to: to, amount: amount, date: date, note: note, createdAt: now });
      MF.db.saveData(db2);
      MF.nav.closeModal();
      MF.nav.toast('Transferencia registrada');
      render();
    }}
  ]);
}

var _transAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.transferencias = _transAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _transAPI; }
