// src/modules/configuracion.js
// Configuración: apariencia, recordatorios, datos, info.

function render() {
  MF.nav.setFabAction(null);
  var db  = MF.db.loadData();
  var cur = (db.settings && db.settings.currency) || '$';

  var notifPermission = window.MF && window.MF.pwa
    ? window.MF.pwa.getNotificationPermission()
    : 'unsupported';

  var notifLabel = { granted: 'Concedido', denied: 'Denegado', default: 'No solicitado', unsupported: 'No disponible' };

  var usedKB      = MF.db.storageUsedKB();
  var isInstalled = window.MF && window.MF.pwa ? window.MF.pwa.isInstalled() : false;

  var viewHTML = '<div style="max-width:600px">'

    + '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:16px">Apariencia</h3>'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><div style="font-weight:500">Tema</div><div style="font-size:12px;color:var(--text3)">Oscuro o claro</div></div>'
    + '<button class="btn" id="btn-toggle-theme">Cambiar tema</button>'
    + '</div></div>'

    + '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:16px">Recordatorios</h3>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    + '<div><div style="font-weight:500">Recordatorio diario</div>'
    + '<div style="font-size:12px;color:var(--text3)">Notifica si no hay movimientos en el d\u00eda</div></div>'
    + '<label class="toggle"><input type="checkbox" id="toggle-reminder" ' + ((db.settings && db.settings.reminderEnabled) ? 'checked' : '') + '>'
    + '<span class="toggle-slider"></span></label>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
    + '<label style="font-size:13px;color:var(--text2)">Hora</label>'
    + '<input class="form-input" id="reminder-time" type="time" value="' + MF.nav.esc((db.settings && db.settings.reminderTime) || '20:00') + '" style="width:auto">'
    + '</div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div style="font-size:12px;color:var(--text3)">Permiso de notificaciones: ' + MF.nav.esc(notifLabel[notifPermission] || notifPermission) + '</div>'
    + (notifPermission === 'default' ? '<button class="btn btn-primary" id="btn-request-notif" style="font-size:12px">Solicitar permiso</button>' : '')
    + '</div>'
    + '<p style="font-size:11px;color:var(--text3);margin-top:8px">Los recordatorios requieren que el navegador est\u00e9 abierto.</p>'
    + '</div>'

    + '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:16px">Moneda</h3>'
    + '<div class="form-group"><label class="form-label">S\u00edmbolo de moneda</label>'
    + '<input class="form-input" id="currency-input" value="' + MF.nav.esc(cur) + '" maxlength="4" style="max-width:80px">'
    + '</div>'
    + '<button class="btn btn-primary" id="btn-save-currency">Guardar</button>'
    + '</div>'

    + '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:16px">Datos</h3>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
    + '<button class="btn" id="btn-load-demo">' + MF.icons.reporte + ' Cargar datos de prueba</button>'
    + '<button class="btn" id="btn-export-json">' + MF.icons.gastos + ' Exportar JSON (backup)</button>'
    + '<button class="btn" id="btn-export-csv">' + MF.icons.categorias + ' Exportar CSV (transacciones)</button>'
    + '<button class="btn" id="btn-import-json">' + MF.icons.gastos + ' Importar JSON</button>'
    + '</div></div>'

    + '<div class="danger-zone card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:8px;color:var(--expense)">Zona de peligro</h3>'
    + '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">Escribe <strong>BORRAR</strong> para habilitar el bot\u00f3n de reset.</p>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input class="form-input" id="reset-confirm" placeholder="BORRAR" style="flex:1">'
    + '<button class="btn btn-danger" id="btn-reset" disabled>Borrar todos los datos</button>'
    + '</div></div>'

    + '<div class="card">'
    + '<h3 style="margin-bottom:12px">Info</h3>'
    + '<div style="font-size:13px;color:var(--text2);display:flex;flex-direction:column;gap:6px">'
    + '<div>Versi\u00f3n: <strong>2.0.0</strong></div>'
    + '<div>Almacenamiento: <strong>' + MF.nav.esc(usedKB) + ' KB</strong></div>'
    + (isInstalled ? '<div>' + MF.icons.check + ' Instalada como PWA</div>' : '')
    + '<div style="margin-top:4px;color:var(--text3)">100% local \u00b7 Sin servidor \u00b7 Datos solo en este dispositivo</div>'
    + '<div style="margin-top:8px">Creado por <a href="https://josue-martinez.web.app" target="_blank" rel="noopener" style="color:var(--accent)">Josu\u00e9 Mart\u00ednez</a></div>'
    + '</div></div>'
    + '</div>';

  var container = document.getElementById('view-configuracion');
  if (!container) return;
  container.textContent = '';
  container.insertAdjacentHTML('beforeend', viewHTML);

  document.getElementById('btn-toggle-theme')?.addEventListener('click', MF.nav.toggleTheme);

  document.getElementById('toggle-reminder')?.addEventListener('change', function(e) {
    var db2 = MF.db.loadData();
    db2.settings.reminderEnabled = e.target.checked;
    MF.db.saveData(db2);
  });

  document.getElementById('reminder-time')?.addEventListener('change', function(e) {
    var db2 = MF.db.loadData();
    db2.settings.reminderTime = e.target.value;
    MF.db.saveData(db2);
  });

  document.getElementById('btn-request-notif')?.addEventListener('click', function() {
    if (window.MF && window.MF.pwa) {
      window.MF.pwa.requestNotificationPermission().then(function(result) {
        MF.nav.toast(result === 'granted' ? 'Permiso concedido' : 'Permiso no concedido', result === 'granted' ? 'success' : 'error');
        render();
      });
    }
  });

  document.getElementById('btn-save-currency')?.addEventListener('click', function() {
    var val = ((document.getElementById('currency-input') || {}).value || '').trim();
    if (!val) return;
    var db2 = MF.db.loadData();
    db2.settings.currency = val;
    MF.db.saveData(db2);
    MF.nav.toast('Moneda guardada');
    render();
  });

  document.getElementById('btn-load-demo')?.addEventListener('click', function() {
    var db2 = MF.db.loadData();
    var hasDdata = db2.transactions.length > 0 || db2.accounts.length > 0;
    if (hasDdata) {
      MF.nav.showModal(
        '<p style="color:var(--text2)">Esto agregar\u00e1 datos de ejemplo a tu DB actual. \u00bfContinuar?</p>',
        'Cargar datos demo',
        [
          { label: 'Cancelar', action: MF.nav.closeModal },
          { label: 'Cargar demo', primary: true, action: function() {
            MF.db.generateDemoData();
            MF.nav.closeModal();
            MF.nav.toast('Datos de prueba cargados');
            render();
          }}
        ]
      );
    } else {
      MF.db.generateDemoData();
      MF.nav.toast('Datos de prueba cargados');
      render();
    }
  });

  document.getElementById('btn-export-json')?.addEventListener('click', function() {
    MF.sync.exportJSON();
    MF.nav.toast('Backup exportado');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', function() {
    MF.sync.exportCSV();
    MF.nav.toast('CSV exportado');
  });

  document.getElementById('btn-import-json')?.addEventListener('click', function() {
    MF.sync.importIncremental();
  });

  document.getElementById('reset-confirm')?.addEventListener('input', function(e) {
    var btn = document.getElementById('btn-reset');
    if (btn) btn.disabled = e.target.value !== 'BORRAR';
  });

  document.getElementById('btn-reset')?.addEventListener('click', function() {
    MF.nav.showModal(
      '<p style="color:var(--expense);display:flex;align-items:center;gap:6px">' + MF.icons.warning + '<strong> Esta acci\u00f3n es irreversible.</strong></p>'
      + '<p style="color:var(--text2);margin-top:8px">Se borrar\u00e1n todas las cuentas, transacciones, presupuestos y dem\u00e1s datos.</p>',
      'Borrar todos los datos',
      [
        { label: 'Cancelar', action: MF.nav.closeModal },
        { label: 'S\u00ed, borrar todo', danger: true, action: function() {
          MF.db.clearData();
          MF.nav.closeModal();
          MF.nav.toast('Datos eliminados. La app comienza desde cero.');
          MF.nav.go('dashboard');
        }}
      ]
    );
  });
}

var _configAPI = { render: render };
if (typeof window !== 'undefined') { window.MF = window.MF || {}; window.MF.configuracion = _configAPI; }
if (typeof module !== 'undefined' && module.exports) { module.exports = _configAPI; }
