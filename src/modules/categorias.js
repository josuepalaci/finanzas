// src/modules/categorias.js
// CRUD de categorías personalizadas. Las predeterminadas son ocultables, no eliminables.

var DEFAULT_CATS = [
  { name: 'Alimentaci\u00f3n', color: '#7aa2f7', icon: 'food' },
  { name: 'Transporte',       color: '#ff9e64', icon: 'car' },
  { name: 'Entretenimiento',  color: '#bb9af7', icon: 'film' },
  { name: 'Salud',            color: '#9ece6a', icon: 'health' },
  { name: 'Servicios',        color: '#f7768e', icon: 'bolt' },
  { name: 'Ropa',             color: '#73daca', icon: 'shirt' },
  { name: 'Hogar',            color: '#e0af68', icon: 'house' },
  { name: 'Educaci\u00f3n',  color: '#2ac3de', icon: 'book' },
  { name: 'Ingresos',         color: '#9ece6a', icon: 'gastos' },
  { name: 'Otro',             color: '#565f89', icon: 'other' }
];

function render() {
  MF.nav.setFabAction(_openAddModal);
  var db        = MF.db.loadData();
  var hidden    = new Set((db.settings && db.settings.hiddenCats) || []);

  var defaultHTML = DEFAULT_CATS.map(function(cat) {
    var isHidden = hidden.has(cat.name);
    return '<div class="list-item">'
      + '<div class="list-item__icon" style="background:' + MF.nav.esc(cat.color) + '">' + (MF.icons[cat.icon] || '') + '</div>'
      + '<div class="list-item__content">'
      + '<div class="list-item__title">' + MF.nav.esc(cat.name) + '</div>'
      + '<div class="list-item__sub" style="color:var(--text3)">Predeterminada</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:12px;color:var(--text3)">' + (isHidden ? 'Oculta' : 'Visible') + '</span>'
      + '<button class="btn btn-ghost" style="font-size:12px" data-action="toggle-default" data-name="' + MF.nav.esc(cat.name) + '">'
      + (isHidden ? 'Mostrar' : 'Ocultar') + '</button>'
      + '</div></div>';
  }).join('');

  var customHTML = db.categories.length ? db.categories.map(function(cat) {
    return '<div class="list-item">'
      + '<div class="list-item__icon" style="background:' + MF.nav.esc(cat.color) + '">' + (MF.icons[cat.icon] || MF.nav.esc(cat.icon || '')) + '</div>'
      + '<div class="list-item__content">'
      + '<div class="list-item__title">' + MF.nav.esc(cat.name) + '</div>'
      + '<div class="list-item__sub" style="color:var(--text3)">Personalizada</div>'
      + '</div>'
      + '<div class="list-item__actions" style="opacity:1">'
      + '<button class="btn-icon" data-action="edit-cat" data-id="' + MF.nav.esc(cat.id) + '">' + MF.icons.pencil + '</button>'
      + '<button class="btn-icon" data-action="del-cat"  data-id="' + MF.nav.esc(cat.id) + '">' + MF.icons.trash + '</button>'
      + '</div></div>';
  }).join('')
  : '<p style="color:var(--text3);font-size:13px">Sin categor\u00edas personalizadas. Crea una con el bot\u00f3n +</p>';

  var container = document.getElementById('view-categorias');
  if (!container) return;
  container.textContent = '';
  container.insertAdjacentHTML('beforeend',
    '<div style="max-width:700px">'
    + '<div class="section-header" style="margin-bottom:12px"><h2>Categor\u00edas predeterminadas</h2></div>'
    + '<div id="cat-defaults-list">' + defaultHTML + '</div>'
    + '<div class="section-header" style="margin-top:24px;margin-bottom:12px"><h2>Categor\u00edas personalizadas</h2></div>'
    + '<div id="cat-custom-list">' + customHTML + '</div>'
    + '</div>');

  document.getElementById('cat-defaults-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action="toggle-default"]');
    if (!btn) return;
    var name = btn.dataset.name;
    var db2  = MF.db.loadData();
    db2.settings = db2.settings || {};
    db2.settings.hiddenCats = db2.settings.hiddenCats || [];
    var idx = db2.settings.hiddenCats.indexOf(name);
    if (idx >= 0) db2.settings.hiddenCats.splice(idx, 1);
    else db2.settings.hiddenCats.push(name);
    MF.db.saveData(db2);
    render();
  });

  document.getElementById('cat-custom-list')?.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'edit-cat') {
      _openAddModal(btn.dataset.id);
    } else if (action === 'del-cat') {
      var delId = btn.dataset.id;
      MF.nav.showModal('<p style="color:var(--text2)">\u00bfEliminar esta categor\u00eda?</p>', 'Eliminar', [
        { label: 'Cancelar', action: MF.nav.closeModal },
        { label: 'Eliminar', danger: true, action: function() {
          var db2 = MF.db.loadData();
          db2.categories = db2.categories.filter(function(c) { return c.id !== delId; });
          MF.db.saveData(db2); MF.nav.closeModal(); render();
        }}
      ]);
    }
  });
}

function _openAddModal(id) {
  var db  = MF.db.loadData();
  var cat = id ? db.categories.find(function(c) { return c.id === id; }) : null;

  var formHTML = '<div class="form-group"><label class="form-label">Nombre</label>'
    + '<input class="form-input" id="cat-name" value="' + MF.nav.esc(cat ? cat.name : '') + '" placeholder="ej: Mascotas"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label class="form-label">Color</label>'
    + '<input class="form-input" id="cat-color" type="color" value="' + MF.nav.esc(cat ? cat.color : '#7aa2f7') + '" style="height:40px;padding:4px"></div>'
    + '<div class="form-group"><label class="form-label">Emoji / \u00cdcono</label>'
    + '<input class="form-input" id="cat-icon" value="' + MF.nav.esc(cat ? cat.icon : '') + '" placeholder="\uD83D\uDC36" maxlength="4"></div>'
    + '</div>';

  MF.nav.showModal(formHTML, cat ? 'Editar categor\u00eda' : 'Nueva categor\u00eda', [
    { label: 'Cancelar', action: MF.nav.closeModal },
    { label: cat ? 'Guardar' : 'Crear', primary: true, action: function() {
      var name  = ((document.getElementById('cat-name') || {}).value || '').trim();
      var color = (document.getElementById('cat-color') || {}).value;
      var icon  = ((document.getElementById('cat-icon') || {}).value || '').trim();
      if (!name) { MF.nav.toast('Nombre requerido', 'error'); return; }
      var db2 = MF.db.loadData(); var now = new Date().toISOString();
      if (id) {
        var idx = db2.categories.findIndex(function(c) { return c.id === id; });
        if (idx >= 0) db2.categories[idx] = Object.assign({}, db2.categories[idx], { name: name, color: color, icon: icon, updatedAt: now });
      } else {
        db2.categories.push({ id: MF.db.generateId(), name: name, color: color, icon: icon, isCustom: true, hidden: false });
      }
      MF.db.saveData(db2); MF.nav.closeModal(); MF.nav.toast(id ? 'Categor\u00eda actualizada' : 'Categor\u00eda creada'); render();
    }}
  ]);
}

function getCatColor(cat, db) {
  var custom = (db.categories || []).find(function(c) { return c.name === cat; });
  if (custom && custom.color) return custom.color;
  var def = DEFAULT_CATS.find(function(c) { return c.name === cat; });
  if (def && def.color) return def.color;
  return '#7aa2f7';
}

var _catAPI = { render: render, getCatColor: getCatColor };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.categorias = _catAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _catAPI; }
