// src/modules/quickadd.js
// Registro rápido desde un atajo de iOS: intent por URL y generación del .shortcut.

const QUICKADD_SECTION = 'quick-add';
const DEFAULT_CAT      = 'Apple Pay';
const DEFAULT_SOURCE   = 'applepay';
const MAX_DESC         = 120;

// ── Outbox: Safari → portapapeles → PWA instalada ─────────────────────────
// La copia de Safari es un buzón: las transacciones del atajo se acumulan en
// db.quickaddOutbox y viajan a la app instalada por el portapapeles, con
// dedup por UUID en el destino. El payload nunca lleva la cuenta: los UUID de
// cuenta difieren entre copias.
const OUTBOX_PREFIX = 'MFSYNC1:';
const OUTBOX_MAX    = 100;

function buildOutboxPayload(txs) {
  const items = (txs || []).slice(-OUTBOX_MAX).map(t => ({
    id: t.id, desc: t.desc, amount: t.amount, cat: t.cat || '', date: t.date,
    note: t.note || '', type: t.type, source: t.source || '',
    createdAt: t.createdAt || '', updatedAt: t.updatedAt || ''
  }));
  return OUTBOX_PREFIX + JSON.stringify(items);
}

// El portapapeles es entrada no confiable: aquí vive TODA la validación.
function parseOutboxPayload(str) {
  if (typeof str !== 'string' || !str.startsWith(OUTBOX_PREFIX)) return null;
  let arr;
  try { arr = JSON.parse(str.slice(OUTBOX_PREFIX.length)); } catch (_) { return null; }
  if (!Array.isArray(arr)) return null;

  const out = [];
  for (const t of arr.slice(0, OUTBOX_MAX)) {
    if (!t || typeof t !== 'object') continue;
    const id     = typeof t.id === 'string' ? t.id.trim() : '';
    const desc   = typeof t.desc === 'string' ? t.desc.trim().slice(0, MAX_DESC) : '';
    const amount = t.amount;
    const type   = t.type === 'income' || t.type === 'expense' ? t.type : '';
    const date   = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '';
    if (!id || !desc || !Number.isFinite(amount) || amount <= 0 || !type || !date) continue;
    out.push({
      id, desc, amount, type, date,
      cat:       typeof t.cat === 'string' ? t.cat.slice(0, 40) : '',
      note:      typeof t.note === 'string' ? t.note.slice(0, 500) : '',
      source:    typeof t.source === 'string' ? t.source.slice(0, 20) : '',
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : '',
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : ''
    });
  }
  return out.length ? out : null;
}

// ── isQuickAddHash ─────────────────────────────────────────────────────────
// Separa "este hash no era para mí" de "venía dirigido a mí pero con datos
// inválidos". El segundo caso merece un aviso al usuario; el primero, silencio.

function isQuickAddHash(hash) {
  if (typeof hash !== 'string') return false;
  const raw  = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');
  return qIdx >= 0 && raw.slice(0, qIdx) === QUICKADD_SECTION;
}

// ── parseIntent ────────────────────────────────────────────────────────────
// Traduce '#quick-add?desc=…&amount=…' a un objeto listo para prefill.
// Devuelve null ante cualquier entrada que no represente un gasto válido:
// la validación vive aquí, no en el llamador.

function parseIntent(hash) {
  if (!isQuickAddHash(hash)) return null;

  const raw  = hash.charAt(0) === '#' ? hash.slice(1) : hash;
  const qIdx = raw.indexOf('?');

  let params;
  try {
    params = new URLSearchParams(raw.slice(qIdx + 1));
  } catch (_) {
    return null;
  }

  const desc = (params.get('desc') || '').trim().slice(0, MAX_DESC);
  if (!desc) return null;

  const amount = parseFloat(params.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    desc:   desc,
    amount: amount,
    cat:    (params.get('cat') || '').trim() || DEFAULT_CAT,
    src:    (params.get('src') || '').trim() || DEFAULT_SOURCE
  };
}

// ── isIOS ──────────────────────────────────────────────────────────────────
// Recibe el navigator por parámetro para poder testearlo sin DOM.

function isIOS(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ se identifica como Mac; solo el soporte multitáctil lo delata.
  return /Mac/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

// ── resolveAccount ─────────────────────────────────────────────────────────

function resolveAccount(db) {
  const accounts = (db && db.accounts) || [];
  if (!accounts.length) return '';
  const preferred = (db.settings && db.settings.applePayAccount) || '';
  if (preferred && accounts.some(a => a.id === preferred)) return preferred;
  return accounts[0].id;
}

// ── consume ────────────────────────────────────────────────────────────────
// Lee el intent del hash, lo neutraliza y abre el modal de confirmación.

function consume() {
  if (!isQuickAddHash(location.hash)) return false;

  const intent = parseIntent(location.hash);

  // Limpiar el hash ANTES de cualquier otra cosa: si el usuario recarga la
  // página, el intent no debe volver a dispararse y duplicar el gasto.
  history.replaceState(null, '', location.pathname + location.search);

  const db = MF.db.loadData();

  if (!(db.accounts || []).length) {
    MF.nav.toast('Crea una cuenta primero', 'error');
    MF.nav.go('cuentas');
    return false;
  }

  // El atajo apuntaba aquí pero mandó datos inválidos: se avisa y se abre el
  // modal vacío, para que el gasto se pueda registrar a mano sin reintentar.
  if (!intent) {
    MF.nav.toast('Datos incompletos en el enlace', 'error');
    MF.gastos.openAddModal(null, { account: resolveAccount(db), type: 'expense' });
    return false;
  }

  MF.gastos.openAddModal(null, {
    desc:       intent.desc,
    amount:     intent.amount,
    cat:        _knownCat(intent.cat, db),
    source:     intent.src,
    account:    resolveAccount(db),
    type:       'expense',
    date:       MF.db.localISODate(),
    modalTitle: 'Gasto desde Apple Pay'
  });

  return true;
}

// Una categoría que no existe en la app no puede preseleccionarse: el <select>
// mostraría la primera de la lista en vez del default. Se resuelve aquí.
function _knownCat(cat, db) {
  const known = ((MF.categorias && MF.categorias.DEFAULT_CATS) || []).map(c => c.name)
    .concat((db.categories || []).map(c => c.name));
  return known.includes(cat) ? cat : DEFAULT_CAT;
}

// ── Generación del .shortcut ───────────────────────────────────────────────
// El plist va sin firmar: iOS solo lo importa con "Permitir atajos no
// confiables" activado. Las instrucciones manuales son el camino de respaldo.

// U+FFFC (object replacement character) marca dónde Shortcuts inserta la
// salida de una acción previa dentro de un WFTextTokenString.
const TOKEN = '￼';

// UUIDs constantes, no aleatorios: dos descargas del mismo atajo deben ser
// byte a byte idénticas para que el test de determinismo tenga sentido.
const UUID_ASK_DESC   = 'C7A1F2E0-0001-4A00-9000-4D6973466E7A';
const UUID_ENCODE     = 'C7A1F2E0-0002-4A00-9000-4D6973466E7A';
const UUID_ASK_AMOUNT = 'C7A1F2E0-0003-4A00-9000-4D6973466E7A';

function _xmlEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Referencia a la salida de una acción previa, por UUID.
function _attachment(name, uuid) {
  return '<dict>'
    + '<key>OutputName</key><string>' + _xmlEsc(name) + '</string>'
    + '<key>OutputUUID</key><string>' + uuid + '</string>'
    + '<key>Type</key><string>ActionOutput</string>'
    + '</dict>';
}

// WFTextTokenString: un string con placeholders más el mapa rango → attachment.
// Los rangos se calculan sobre el string sin escapar, que es el que ve iOS tras
// parsear el XML.
function _tokenString(template, ranges) {
  const pairs = ranges
    .map(r => '<key>{' + r.pos + ', 1}</key>' + _attachment(r.name, r.uuid))
    .join('');
  return '<dict>'
    + '<key>Value</key><dict>'
    + '<key>attachmentsByRange</key><dict>' + pairs + '</dict>'
    + '<key>string</key><string>' + _xmlEsc(template) + '</string>'
    + '</dict>'
    + '<key>WFSerializationType</key><string>WFTextTokenString</string>'
    + '</dict>';
}

function _action(identifier, paramsXML) {
  return '<dict>'
    + '<key>WFWorkflowActionIdentifier</key><string>' + identifier + '</string>'
    + '<key>WFWorkflowActionParameters</key><dict>' + paramsXML + '</dict>'
    + '</dict>';
}

function buildShortcutPlist(baseUrl) {
  const base = String(baseUrl == null ? '' : baseUrl).replace(/#.*$/, '');
  const url  = base + '#' + QUICKADD_SECTION
             + '?desc=' + TOKEN + '&amount=' + TOKEN + '&src=' + DEFAULT_SOURCE;

  const posDesc   = url.indexOf(TOKEN);
  const posAmount = url.indexOf(TOKEN, posDesc + 1);

  const askDesc = _action('is.workflow.actions.ask',
      '<key>UUID</key><string>' + UUID_ASK_DESC + '</string>'
    + '<key>WFAskActionPrompt</key><string>' + _xmlEsc('¿En qué gastaste?') + '</string>'
    + '<key>WFInputType</key><string>Text</string>'
    + '<key>CustomOutputName</key><string>Descripcion</string>');

  const encodeDesc = _action('is.workflow.actions.urlencode',
      '<key>UUID</key><string>' + UUID_ENCODE + '</string>'
    + '<key>WFEncodeMode</key><string>Encode</string>'
    + '<key>WFInput</key>'
    + _tokenString(TOKEN, [{ pos: 0, name: 'Descripcion', uuid: UUID_ASK_DESC }])
    + '<key>CustomOutputName</key><string>DescripcionCodificada</string>');

  const askAmount = _action('is.workflow.actions.ask',
      '<key>UUID</key><string>' + UUID_ASK_AMOUNT + '</string>'
    + '<key>WFAskActionPrompt</key><string>' + _xmlEsc('¿Cuánto?') + '</string>'
    + '<key>WFInputType</key><string>Number</string>'
    + '<key>CustomOutputName</key><string>Monto</string>');

  const openUrl = _action('is.workflow.actions.openurl',
      '<key>WFInput</key>'
    + _tokenString(url, [
        { pos: posDesc,   name: 'DescripcionCodificada', uuid: UUID_ENCODE },
        { pos: posAmount, name: 'Monto',                 uuid: UUID_ASK_AMOUNT }
      ]));

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict>'
    + '<key>WFWorkflowClientVersion</key><string>1146.7</string>'
    + '<key>WFWorkflowMinimumClientVersion</key><integer>900</integer>'
    + '<key>WFWorkflowMinimumClientVersionString</key><string>900</string>'
    + '<key>WFWorkflowIcon</key><dict>'
    + '<key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>'
    + '<key>WFWorkflowIconStartColor</key><integer>463140863</integer>'
    + '</dict>'
    + '<key>WFWorkflowImportQuestions</key><array/>'
    + '<key>WFWorkflowInputContentItemClasses</key><array/>'
    + '<key>WFWorkflowTypes</key><array/>'
    + '<key>WFWorkflowActions</key><array>'
    + askDesc + encodeDesc + askAmount + openUrl
    + '</array>'
    + '</dict></plist>\n';
}

// ── Descarga del atajo ─────────────────────────────────────────────────────

// La URL del atajo se deriva de dónde está servida la app, no se hardcodea:
// así el atajo generado desde GitHub Pages apunta a GitHub Pages, y el generado
// desde una copia local apunta a esa copia.
function shortcutBaseUrl() {
  return location.origin + _normalizePath(location.pathname);
}

// Bajo un subdirectorio ('/finanzas'), GitHub Pages responde un 301 hacia
// '/finanzas/'. Un atajo que apunte a la forma sin barra depende de que el
// fragmento sobreviva esa redirección; añadirla evita el riesgo.
function _normalizePath(pathname) {
  const path = pathname || '/';
  if (path.endsWith('/')) return path;
  if (/\/[^/]+\.[a-z0-9]+$/i.test(path)) return path; // apunta a un archivo
  return path + '/';
}

function downloadShortcut() {
  const plist = buildShortcutPlist(shortcutBaseUrl());
  const blob  = new Blob([plist], { type: 'application/octet-stream' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = 'MisFinanzas.shortcut';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Card de instalación ────────────────────────────────────────────────────
// Texto estático del propio código: lleva HTML a propósito y no pasa por esc().

// El orden espeja las acciones del plist: preguntar, codificar, preguntar, abrir.
const _PASOS = [
  'Abre la app Atajos y pulsa + para crear uno nuevo.',
  'Agrega la acción <strong>Pedir entrada</strong> con tipo Texto y la pregunta «¿En qué gastaste?».',
  'Agrega <strong>Codificar URL</strong> y pásale esa respuesta. Sin este paso, una descripción con «&» o con acentos rompe el enlace.',
  'Agrega otra <strong>Pedir entrada</strong> con tipo Número y la pregunta «¿Cuánto?».',
  'Agrega <strong>Abrir URL</strong> y pega la URL base; sustituye <code>DESC</code> por el texto codificado y <code>MONTO</code> por la respuesta numérica.',
  'En la pestaña Automatización, crea una automatización personal <strong>App → Wallet → Se cierra</strong> que ejecute este atajo, con «Ejecutar inmediatamente» activado.',
  'Ya creado: mantén pulsado el atajo → <strong>Compartir</strong> → <strong>Copiar enlace de iCloud</strong>, y pega ese enlace aquí abajo.'
];

// Enlace oficial del atajo, firmado por Apple (compartido vía iCloud). Se usa
// cuando el usuario no ha guardado uno propio; así la card instala de un toque.
const DEFAULT_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/7e803a7501594afea8a98e4207dad40b';

function resolveShortcutLink(saved) {
  return normalizeShortcutLink(saved) || DEFAULT_SHORTCUT_URL;
}

// Solo aceptamos enlaces de iCloud: son los únicos que Apple firma, y evita que
// un valor arbitrario acabe en un window.open.
function normalizeShortcutLink(raw) {
  const s = (typeof raw === 'string' ? raw : '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch (_) { return ''; }
  if (u.protocol !== 'https:') return '';
  if (u.hostname !== 'www.icloud.com' && u.hostname !== 'icloud.com') return '';
  if (!/^\/shortcuts\/[A-Za-z0-9]+\/?$/.test(u.pathname)) return '';
  return u.href;
}

function renderInstallCard(slot) {
  if (!slot) return;
  if (!isIOS(navigator)) return;

  const db       = MF.db.loadData();
  const accounts = db.accounts || [];
  const current  = (db.settings && db.settings.applePayAccount) || '';
  const propio   = normalizeShortcutLink(db.settings && db.settings.applePayShortcutUrl);

  const accOptions = accounts.length
    ? accounts.map(a =>
        '<option value="' + MF.nav.esc(a.id) + '"' + (current === a.id ? ' selected' : '') + '>'
        + MF.nav.esc(a.name) + '</option>').join('')
    : '<option value="">Sin cuentas</option>';

  const standalone = window.matchMedia
    && window.matchMedia('(display-mode: standalone)').matches;

  const aviso = standalone
    ? '<p style="font-size:11px;color:var(--text3);margin-top:12px;line-height:1.5">'
      + MF.icons.warning + ' Estás usando la app instalada. Los enlaces que abre Atajos van a Safari, '
      + 'que guarda los datos por separado. Activa <strong>Ajustes → Apps → Safari → Abrir enlaces en app web</strong> '
      + '(iOS 18.4 o superior) para que el gasto llegue aquí.</p>'
    : '';

  const pasosHTML = _PASOS.map(p => '<li style="margin-bottom:6px">' + p + '</li>').join('');

  const html = '<div class="card" style="margin-bottom:16px">'
    + '<h3 style="margin-bottom:8px">Registro rápido desde iOS</h3>'
    + '<p style="font-size:13px;color:var(--text2);margin-bottom:16px">'
    + 'Un atajo que registra el gasto justo después de pagar con Apple Pay.</p>'
    + '<div class="form-group"><label class="form-label">Cuenta destino</label>'
    + '<select class="form-select" id="quickadd-account"' + (accounts.length ? '' : ' disabled') + '>'
    + accOptions + '</select></div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">'
    + '<button class="btn btn-primary" id="btn-install-shortcut">Instalar atajo</button>'
    + '<button class="btn" id="btn-copy-quickadd-url">Copiar URL base</button>'
    + (propio ? '<button class="btn btn-ghost" id="btn-forget-shortcut-link">Olvidar enlace</button>' : '')
    + '</div>'
    + '<details style="margin-top:12px">'
    + '<summary style="cursor:pointer;font-size:13px;color:var(--accent)">Usar mi propio atajo</summary>'
    + '<p style="font-size:12px;color:var(--text2);margin:12px 0 0;line-height:1.5">'
    + 'iOS solo instala atajos <strong>firmados por Apple</strong>. Puedes crear el tuyo a mano y '
    + 'compartirlo como enlace de iCloud: ese enlace queda firmado y se instala de un toque.</p>'
    + '<ol style="font-size:12px;color:var(--text2);margin:12px 0 0 18px;line-height:1.5">'
    + pasosHTML + '</ol>'
    + '<div class="form-group" style="margin-top:12px"><label class="form-label">Enlace de iCloud del atajo</label>'
    + '<input class="form-input" id="quickadd-link" inputmode="url" autocapitalize="off" '
    + 'autocorrect="off" spellcheck="false" placeholder="https://www.icloud.com/shortcuts/…"></div>'
    + '<button class="btn btn-primary" id="btn-save-shortcut-link" style="margin-top:8px">Guardar enlace</button>'
    + '</details>'
    + aviso
    + '<details style="margin-top:12px">'
    + '<summary style="cursor:pointer;font-size:13px;color:var(--accent)">Opciones avanzadas</summary>'
    + '<p style="font-size:12px;color:var(--text2);margin:12px 0 0;line-height:1.5">'
    + 'Descarga el <code>.shortcut</code> sin firmar. iOS no lo importa tal cual: hay que firmarlo '
    + 'en un Mac con <code>shortcuts sign -m anyone -i entrada.shortcut -o firmado.shortcut</code>.</p>'
    + '<button class="btn" id="btn-download-shortcut" style="margin-top:10px">Descargar .shortcut sin firmar</button>'
    + '</details>'
    + '</div>';

  slot.textContent = '';
  slot.insertAdjacentHTML('beforeend', html);

  document.getElementById('quickadd-account')?.addEventListener('change', e => {
    const db2 = MF.db.loadData();
    db2.settings.applePayAccount = e.target.value;
    MF.db.saveData(db2);
    MF.nav.toast('Cuenta guardada');
  });

  document.getElementById('btn-download-shortcut')?.addEventListener('click', () => {
    downloadShortcut();
    MF.nav.toast('Atajo descargado');
  });

  document.getElementById('btn-install-shortcut')?.addEventListener('click', () => {
    // Se relee de la DB en vez de cerrar sobre el valor: así el enlace vuelve a
    // pasar por la validación justo antes de abrirlo.
    const destino = resolveShortcutLink(MF.db.loadData().settings?.applePayShortcutUrl);
    window.open(destino, '_blank', 'noopener');
  });

  document.getElementById('btn-save-shortcut-link')?.addEventListener('click', () => {
    const valor = document.getElementById('quickadd-link')?.value || '';
    const limpio = normalizeShortcutLink(valor);
    if (!limpio) {
      MF.nav.toast('Pega un enlace https://www.icloud.com/shortcuts/…', 'error');
      return;
    }
    const db2 = MF.db.loadData();
    db2.settings.applePayShortcutUrl = limpio;
    MF.db.saveData(db2);
    MF.nav.toast('Enlace guardado');
    renderInstallCard(slot);
  });

  document.getElementById('btn-forget-shortcut-link')?.addEventListener('click', () => {
    const db2 = MF.db.loadData();
    db2.settings.applePayShortcutUrl = '';
    MF.db.saveData(db2);
    MF.nav.toast('Enlace olvidado');
    renderInstallCard(slot);
  });

  document.getElementById('btn-copy-quickadd-url')?.addEventListener('click', () => {
    const url = shortcutBaseUrl() + '#' + QUICKADD_SECTION
              + '?desc=DESC&amount=MONTO&src=' + DEFAULT_SOURCE;
    navigator.clipboard?.writeText(url)
      .then(() => MF.nav.toast('URL copiada'))
      .catch(() => MF.nav.toast('No se pudo copiar', 'error'));
  });
}

// ── Exports ────────────────────────────────────────────────────────────────

const _quickaddAPI = {
  parseIntent,
  isQuickAddHash,
  buildOutboxPayload,
  parseOutboxPayload,
  isIOS,
  resolveAccount,
  consume,
  buildShortcutPlist,
  shortcutBaseUrl,
  _normalizePath,
  downloadShortcut,
  renderInstallCard,
  normalizeShortcutLink,
  resolveShortcutLink,
  DEFAULT_SHORTCUT_URL,
  PASOS_MANUALES: _PASOS,
  QUICKADD_SECTION,
  DEFAULT_CAT,
  DEFAULT_SOURCE,
  MAX_DESC
};

if (typeof window !== 'undefined') {
  window.MF = window.MF || {};
  window.MF.quickadd = _quickaddAPI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _quickaddAPI;
}
