// test/quickadd.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const {
  parseIntent,
  isQuickAddHash,
  isIOS,
  resolveAccount,
  consume,
  renderInstallCard,
  buildShortcutPlist,
  shortcutBaseUrl,
  _normalizePath,
  normalizeShortcutLink,
  PASOS_MANUALES,
  DEFAULT_CAT,
  DEFAULT_SOURCE,
  MAX_DESC
} = require('../src/modules/quickadd');

describe('parseIntent', () => {
  test('extrae los cuatro campos de un hash completo', () => {
    const r = parseIntent('#quick-add?desc=Super%20Selectos&amount=24.50&cat=Alimentaci%C3%B3n&src=applepay');
    assert.equal(r.desc, 'Super Selectos');
    assert.equal(r.amount, 24.5);
    assert.equal(r.cat, 'Alimentación');
    assert.equal(r.src, 'applepay');
  });

  test('acepta el hash sin el # inicial', () => {
    const r = parseIntent('quick-add?desc=Cafe&amount=3');
    assert.equal(r.desc, 'Cafe');
  });

  test('aplica los defaults de cat y src cuando no vienen', () => {
    const r = parseIntent('#quick-add?desc=Cafe&amount=3');
    assert.equal(r.cat, DEFAULT_CAT);
    assert.equal(r.src, DEFAULT_SOURCE);
  });

  test('decodifica descripciones con acentos y símbolos', () => {
    const r = parseIntent('#quick-add?desc=Caf%C3%A9%20%26%20Pan&amount=5');
    assert.equal(r.desc, 'Café & Pan');
  });

  test('trunca desc a MAX_DESC caracteres', () => {
    const largo = 'a'.repeat(MAX_DESC + 50);
    const r = parseIntent('#quick-add?desc=' + largo + '&amount=1');
    assert.equal(r.desc.length, MAX_DESC);
  });

  test('devuelve null si la sección no es quick-add', () => {
    assert.equal(parseIntent('#gastos?desc=Cafe&amount=3'), null);
  });

  test('devuelve null si no hay query string', () => {
    assert.equal(parseIntent('#quick-add'), null);
  });

  test('devuelve null si desc está vacío o es solo espacios', () => {
    assert.equal(parseIntent('#quick-add?desc=&amount=3'), null);
    assert.equal(parseIntent('#quick-add?desc=%20%20&amount=3'), null);
  });

  test('devuelve null si falta desc', () => {
    assert.equal(parseIntent('#quick-add?amount=3'), null);
  });

  test('devuelve null con montos inválidos', () => {
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=0'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=-5'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe&amount=abc'), null);
    assert.equal(parseIntent('#quick-add?desc=Cafe'), null);
  });

  test('devuelve null con entradas que no son string', () => {
    assert.equal(parseIntent(null), null);
    assert.equal(parseIntent(undefined), null);
    assert.equal(parseIntent(42), null);
  });
});

describe('isQuickAddHash', () => {
  test('reconoce un hash dirigido a quick-add, con o sin datos válidos', () => {
    assert.equal(isQuickAddHash('#quick-add?desc=Cafe&amount=3'), true);
    assert.equal(isQuickAddHash('#quick-add?desc=&amount=0'), true);
    assert.equal(isQuickAddHash('quick-add?x=1'), true);
  });

  test('rechaza hashes de otras secciones y entradas basura', () => {
    assert.equal(isQuickAddHash('#gastos'), false);
    assert.equal(isQuickAddHash('#quick-add'), false);
    assert.equal(isQuickAddHash(''), false);
    assert.equal(isQuickAddHash(null), false);
  });
});

describe('isIOS', () => {
  const UA_IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const UA_IPAD_12 = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const UA_MAC     = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const UA_WIN     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

  test('detecta iPhone', () => {
    assert.equal(isIOS({ userAgent: UA_IPHONE, maxTouchPoints: 5 }), true);
  });

  test('detecta iPad antiguo por user agent', () => {
    assert.equal(isIOS({ userAgent: UA_IPAD_12, maxTouchPoints: 5 }), true);
  });

  test('detecta iPadOS 13+ que se reporta como Mac con touch', () => {
    assert.equal(isIOS({ userAgent: UA_MAC, maxTouchPoints: 5 }), true);
  });

  test('rechaza un Mac de escritorio sin touch', () => {
    assert.equal(isIOS({ userAgent: UA_MAC, maxTouchPoints: 0 }), false);
  });

  test('rechaza Windows', () => {
    assert.equal(isIOS({ userAgent: UA_WIN, maxTouchPoints: 0 }), false);
    assert.equal(isIOS({ userAgent: UA_WIN, maxTouchPoints: 10 }), false);
  });

  test('rechaza navigator ausente o vacío', () => {
    assert.equal(isIOS(null), false);
    assert.equal(isIOS(undefined), false);
    assert.equal(isIOS({}), false);
  });
});

describe('resolveAccount', () => {
  const db = (settings, accounts) => ({ settings, accounts });

  test('devuelve la cuenta configurada cuando existe', () => {
    const r = resolveAccount(db({ applePayAccount: 'b' }, [{ id: 'a' }, { id: 'b' }]));
    assert.equal(r, 'b');
  });

  test('cae a la primera cuenta si la configurada fue borrada', () => {
    const r = resolveAccount(db({ applePayAccount: 'zzz' }, [{ id: 'a' }, { id: 'b' }]));
    assert.equal(r, 'a');
  });

  test('cae a la primera cuenta si no hay preferencia', () => {
    assert.equal(resolveAccount(db({}, [{ id: 'a' }])), 'a');
    assert.equal(resolveAccount(db(undefined, [{ id: 'a' }])), 'a');
  });

  test('devuelve cadena vacía si no hay cuentas', () => {
    assert.equal(resolveAccount(db({}, [])), '');
    assert.equal(resolveAccount({}), '');
  });
});

describe('consume', () => {
  // consume() toca location, history y MF; se montan como globals para poder
  // ejercitarlo sin navegador.
  function setup(hash, db) {
    const calls = { toasts: [], modals: [], navs: [], replaced: [] };

    global.location = { hash: hash, pathname: '/app/', search: '' };
    global.history  = { replaceState: (_s, _t, url) => calls.replaced.push(url) };
    global.MF = {
      db:   { loadData: () => db },
      nav:  {
        toast: (msg, type) => calls.toasts.push([msg, type]),
        go:    section => calls.navs.push(section)
      },
      gastos:     { openAddModal: (id, prefill) => calls.modals.push(prefill) },
      categorias: { DEFAULT_CATS: [{ name: 'Apple Pay' }, { name: 'Alimentación' }] }
    };

    return calls;
  }

  const dbConCuenta = () => ({
    accounts: [{ id: 'acc-1' }, { id: 'acc-2' }],
    settings: { applePayAccount: 'acc-2' },
    categories: []
  });

  test('ignora un hash que no le pertenece', () => {
    const calls = setup('#gastos', dbConCuenta());
    assert.equal(consume(), false);
    assert.equal(calls.modals.length, 0);
    assert.equal(calls.replaced.length, 0);
  });

  test('abre el modal con los datos del intent y limpia el hash', () => {
    const calls = setup('#quick-add?desc=Super&amount=24.5', dbConCuenta());
    assert.equal(consume(), true);

    assert.deepEqual(calls.replaced, ['/app/']);
    assert.equal(calls.modals.length, 1);

    const pre = calls.modals[0];
    assert.equal(pre.desc, 'Super');
    assert.equal(pre.amount, 24.5);
    assert.equal(pre.cat, 'Apple Pay');
    assert.equal(pre.source, 'applepay');
    assert.equal(pre.account, 'acc-2');
    assert.equal(pre.type, 'expense');
    assert.equal(pre.modalTitle, 'Gasto desde Apple Pay');
    assert.match(pre.date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('respeta una categoría conocida que venga en la URL', () => {
    const calls = setup('#quick-add?desc=Pan&amount=3&cat=Alimentaci%C3%B3n', dbConCuenta());
    consume();
    assert.equal(calls.modals[0].cat, 'Alimentación');
  });

  test('cae al default cuando la categoría de la URL no existe', () => {
    const calls = setup('#quick-add?desc=Pan&amount=3&cat=Inventada', dbConCuenta());
    consume();
    assert.equal(calls.modals[0].cat, DEFAULT_CAT);
  });

  test('acepta categorías personalizadas de la DB', () => {
    const db = dbConCuenta();
    db.categories = [{ name: 'Mascotas' }];
    const calls = setup('#quick-add?desc=Croquetas&amount=12&cat=Mascotas', db);
    consume();
    assert.equal(calls.modals[0].cat, 'Mascotas');
  });

  test('avisa y abre el modal vacío si el intent trae datos inválidos', () => {
    const calls = setup('#quick-add?desc=Cafe&amount=0', dbConCuenta());
    assert.equal(consume(), false);

    assert.deepEqual(calls.replaced, ['/app/']);
    assert.deepEqual(calls.toasts, [['Datos incompletos en el enlace', 'error']]);
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.modals[0].desc, undefined);
    assert.equal(calls.modals[0].account, 'acc-2');
  });

  test('redirige a cuentas si no hay ninguna creada', () => {
    const calls = setup('#quick-add?desc=Super&amount=10', { accounts: [], settings: {}, categories: [] });
    assert.equal(consume(), false);

    assert.deepEqual(calls.toasts, [['Crea una cuenta primero', 'error']]);
    assert.deepEqual(calls.navs, ['cuentas']);
    assert.equal(calls.modals.length, 0);
  });

  test('limpia el hash antes de abrir el modal, para que recargar no duplique', () => {
    const calls = setup('#quick-add?desc=Super&amount=10', dbConCuenta());
    consume();
    // Tras el replaceState la app queda sin hash: un segundo consume() no hace nada.
    global.location.hash = '';
    assert.equal(consume(), false);
    assert.equal(calls.modals.length, 1);
  });
});

describe('renderInstallCard', () => {
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const UA_WIN    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

  // Slot mínimo: solo lo que renderInstallCard usa.
  function fakeSlot() {
    return {
      html: '',
      textContent: '',
      insertAdjacentHTML(_pos, h) { this.html += h; }
    };
  }

  function setup(userAgent, accounts, enlace) {
    // En Node 24 `navigator` es un global de solo lectura: asignarlo se ignora.
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: userAgent, maxTouchPoints: 5 },
      configurable: true,
      writable: true
    });
    global.window = {
      matchMedia: () => ({ matches: false }),
      MF: undefined
    };
    global.document = { getElementById: () => null };
    global.MF = {
      db:    { loadData: () => ({ accounts: accounts, settings: { applePayAccount: '', applePayShortcutUrl: enlace || '' } }) },
      nav:   { esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') },
      icons: { warning: '<svg></svg>' }
    };
  }

  test('no renderiza nada fuera de iOS', () => {
    setup(UA_WIN, [{ id: 'a', name: 'Visa' }]);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.equal(slot.html, '');
  });

  test('renderiza la card en iOS', () => {
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }]);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(slot.html.includes('Registro rápido desde iOS'));
    assert.ok(slot.html.includes('quickadd-account'));
    assert.ok(slot.html.includes('Opciones avanzadas'));
    assert.ok(slot.html.includes('btn-download-shortcut'));
  });

  test('sin enlace guardado muestra los pasos y el campo para pegarlo', () => {
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }]);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(slot.html.includes('quickadd-link'));
    assert.ok(slot.html.includes('btn-save-shortcut-link'));
    assert.ok(slot.html.includes('firmados por Apple'));
    // Los pasos dejan de estar escondidos tras un <details>.
    assert.ok(slot.html.includes('Codificar URL'));
    assert.ok(!slot.html.includes('btn-install-shortcut'));
  });

  test('con enlace guardado ofrece instalar y olvidar, sin pedirlo de nuevo', () => {
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }], 'https://www.icloud.com/shortcuts/abc123');
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(slot.html.includes('btn-install-shortcut'));
    assert.ok(slot.html.includes('btn-forget-shortcut-link'));
    assert.ok(!slot.html.includes('btn-save-shortcut-link'));
  });

  test('un enlace guardado inválido se ignora y vuelve a pedir el pegado', () => {
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }], 'https://evil.com/shortcuts/abc');
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(!slot.html.includes('btn-install-shortcut'));
    assert.ok(slot.html.includes('btn-save-shortcut-link'));
  });

  test('el enlace guardado nunca se interpola en el HTML', () => {
    const u = 'https://www.icloud.com/shortcuts/abc123';
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }], u);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(!slot.html.includes(u), 'se abre por JS leyendo la DB, no inyectado en markup');
  });

  test('deshabilita el selector cuando no hay cuentas', () => {
    setup(UA_IPHONE, []);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(slot.html.includes('disabled'));
    assert.ok(slot.html.includes('Sin cuentas'));
  });

  test('escapa los nombres de cuenta', () => {
    setup(UA_IPHONE, [{ id: 'a', name: '<img src=x onerror=alert(1)>' }]);
    const slot = fakeSlot();
    renderInstallCard(slot);
    assert.ok(!slot.html.includes('<img src=x'));
    assert.ok(slot.html.includes('&lt;img src=x'));
  });

  test('no explota si el slot no existe', () => {
    setup(UA_IPHONE, [{ id: 'a', name: 'Visa' }]);
    assert.doesNotThrow(() => renderInstallCard(null));
  });
});

describe('shortcutBaseUrl', () => {
  function withLocation(origin, pathname) {
    global.location = { origin: origin, pathname: pathname, search: '', hash: '' };
    return shortcutBaseUrl();
  }

  test('resuelve el despliegue real de GitHub Pages', () => {
    assert.equal(
      withLocation('https://josuepalaci.github.io', '/finanzas/'),
      'https://josuepalaci.github.io/finanzas/'
    );
  });

  test('añade la barra final que GitHub Pages redirigiría', () => {
    assert.equal(
      withLocation('https://josuepalaci.github.io', '/finanzas'),
      'https://josuepalaci.github.io/finanzas/'
    );
  });

  test('respeta una ruta que apunta a un archivo', () => {
    assert.equal(
      withLocation('https://josuepalaci.github.io', '/finanzas/index.html'),
      'https://josuepalaci.github.io/finanzas/index.html'
    );
  });

  test('funciona en la raíz de un dominio', () => {
    assert.equal(withLocation('https://ejemplo.test', '/'), 'https://ejemplo.test/');
  });

  test('funciona en un servidor local', () => {
    assert.equal(withLocation('http://localhost:8099', '/'), 'http://localhost:8099/');
  });
});

describe('_normalizePath', () => {
  test('deja intactas las rutas que ya terminan en barra', () => {
    assert.equal(_normalizePath('/finanzas/'), '/finanzas/');
    assert.equal(_normalizePath('/'), '/');
  });

  test('añade barra a rutas de directorio sin ella', () => {
    assert.equal(_normalizePath('/finanzas'), '/finanzas/');
    assert.equal(_normalizePath('/a/b/c'), '/a/b/c/');
  });

  test('no toca rutas con extensión de archivo', () => {
    assert.equal(_normalizePath('/finanzas/index.html'), '/finanzas/index.html');
    assert.equal(_normalizePath('/app.html'), '/app.html');
  });

  test('tolera pathname vacío', () => {
    assert.equal(_normalizePath(''), '/');
    assert.equal(_normalizePath(undefined), '/');
  });
});

describe('buildShortcutPlist', () => {
  const BASE = 'https://josuepalaci.github.io/finanzas/';

  test('produce la URL del despliegue real', () => {
    const plist = buildShortcutPlist(BASE);
    assert.ok(plist.includes('https://josuepalaci.github.io/finanzas/#quick-add?desc='));
  });

  test('produce un plist XML bien formado', () => {
    const plist = buildShortcutPlist(BASE);
    assert.ok(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(plist.includes('<!DOCTYPE plist PUBLIC'));
    assert.ok(plist.trimEnd().endsWith('</plist>'));
  });

  test('incluye las cuatro acciones en orden', () => {
    const plist = buildShortcutPlist(BASE);
    const orden = [
      'is.workflow.actions.ask',
      'is.workflow.actions.urlencode',
      'is.workflow.actions.ask',
      'is.workflow.actions.openurl'
    ];
    let cursor = 0;
    for (const id of orden) {
      const idx = plist.indexOf(id, cursor);
      assert.ok(idx > -1, 'falta la acción ' + id + ' después de la posición ' + cursor);
      cursor = idx + id.length;
    }
  });

  test('incluye la baseUrl recibida', () => {
    const plist = buildShortcutPlist('https://ejemplo.test/app/');
    assert.ok(plist.includes('https://ejemplo.test/app/#quick-add'));
  });

  test('descarta un hash preexistente en la baseUrl', () => {
    const plist = buildShortcutPlist('https://ejemplo.test/#configuracion');
    assert.ok(plist.includes('https://ejemplo.test/#quick-add'));
    assert.ok(!plist.includes('#configuracion'));
  });

  test('escapa los ampersands de la URL como entidades XML', () => {
    const plist = buildShortcutPlist(BASE);
    assert.ok(plist.includes('&amp;amount='));
    assert.ok(!/[^&]&amount=/.test(plist), 'quedó un & sin escapar');
  });

  test('coloca dos placeholders y los mapea por rango', () => {
    const plist = buildShortcutPlist(BASE);
    const url   = BASE + '#quick-add?desc=￼&amount=￼&src=applepay';
    const posDesc   = url.indexOf('￼');
    const posAmount = url.indexOf('￼', posDesc + 1);
    assert.ok(plist.includes('<key>{' + posDesc + ', 1}</key>'));
    assert.ok(plist.includes('<key>{' + posAmount + ', 1}</key>'));
  });

  test('es determinista: dos llamadas iguales producen el mismo string', () => {
    assert.equal(buildShortcutPlist(BASE), buildShortcutPlist(BASE));
  });

  test('tolera baseUrl vacía sin lanzar', () => {
    assert.ok(buildShortcutPlist('').includes('#quick-add'));
    assert.ok(buildShortcutPlist(null).includes('#quick-add'));
  });
});

describe('normalizeShortcutLink', () => {
  test('acepta un enlace de iCloud con www', () => {
    const u = 'https://www.icloud.com/shortcuts/0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    assert.equal(normalizeShortcutLink(u), u);
  });

  test('acepta el host sin www', () => {
    assert.ok(normalizeShortcutLink('https://icloud.com/shortcuts/abc123'));
  });

  test('recorta espacios alrededor', () => {
    const u = 'https://www.icloud.com/shortcuts/abc123';
    assert.equal(normalizeShortcutLink('   ' + u + '  '), u);
  });

  test('rechaza vacío, null y undefined', () => {
    assert.equal(normalizeShortcutLink(''), '');
    assert.equal(normalizeShortcutLink(null), '');
    assert.equal(normalizeShortcutLink(undefined), '');
  });

  test('rechaza texto que no es URL', () => {
    assert.equal(normalizeShortcutLink('no soy una url'), '');
  });

  test('rechaza http sin cifrar', () => {
    assert.equal(normalizeShortcutLink('http://www.icloud.com/shortcuts/abc123'), '');
  });

  test('rechaza otro dominio aunque la ruta calce', () => {
    assert.equal(normalizeShortcutLink('https://evil.com/shortcuts/abc123'), '');
    assert.equal(normalizeShortcutLink('https://icloud.com.evil.com/shortcuts/abc'), '');
  });

  test('rechaza una ruta de iCloud que no sea de atajos', () => {
    assert.equal(normalizeShortcutLink('https://www.icloud.com/photos/abc123'), '');
  });

  test('rechaza javascript: aunque mencione icloud', () => {
    assert.equal(normalizeShortcutLink('javascript:alert(1)//icloud.com/shortcuts/a'), '');
  });
});

describe('PASOS_MANUALES', () => {
  test('incluye el paso de codificar en URL que exige el plist', () => {
    const texto = PASOS_MANUALES.join(' ').toLowerCase();
    assert.ok(texto.includes('url'), 'debe mencionar codificación de URL');
    assert.ok(PASOS_MANUALES.some(p => /codific/i.test(p)));
  });

  test('cubre las cuatro acciones del atajo mas la automatizacion', () => {
    assert.ok(PASOS_MANUALES.length >= 5);
  });

  test('no queda ningun paso vacio', () => {
    PASOS_MANUALES.forEach(p => assert.ok(p.trim().length > 0));
  });
});
