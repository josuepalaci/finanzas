#!/usr/bin/env node
// build.js — MisFinanzas v2 build script

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

function download(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 MisFinanzas-Build/2.0', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function getChartJs() {
  const cache = 'vendor/chart.umd.min.js';
  if (fs.existsSync(cache)) {
    console.log('  chart.js ← cache');
    return fs.readFileSync(cache, 'utf8');
  }
  const url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
  console.log('  chart.js ← download');
  const buf = await download(url);
  ensureDir('vendor');
  fs.writeFileSync(cache, buf);
  return buf.toString('utf8');
}

async function getFontsCSS() {
  const cssCache  = 'vendor/fonts.css';
  if (fs.existsSync(cssCache)) {
    console.log('  fonts    ← cache');
    return fs.readFileSync(cssCache, 'utf8');
  }

  console.log('  fonts    ← download');
  const gFontsUrl = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap';
  const cssBuf = await download(gFontsUrl, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
  });
  let css = cssBuf.toString('utf8');

  const fontUrlRe = /url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g;
  const matches = [...css.matchAll(fontUrlRe)];

  for (const m of matches) {
    const fontUrl = m[1];
    try {
      const fontBuf = await download(fontUrl);
      const b64 = fontBuf.toString('base64');
      css = css.replace(`url(${fontUrl})`, `url(data:font/woff2;base64,${b64})`);
    } catch (e) {
      console.warn(`  warn: could not inline font ${fontUrl}: ${e.message}`);
    }
  }

  ensureDir('vendor');
  fs.writeFileSync(cssCache, css);
  return css;
}

async function buildCSS() {
  const fontsCSS = await getFontsCSS();
  const files = ['base.css', 'themes.css', 'layout.css', 'components.css'];
  const parts = files.map(f => fs.readFileSync(path.join('src/styles', f), 'utf8'));
  const appCSS = parts.join('\n').replace(/@import url\([^)]+\);/g, '');
  return `/* Fonts */\n${fontsCSS}\n/* App */\n${appCSS}`;
}

const MODULE_ORDER = [
  'icons.js', 'db.js', 'sync.js', 'analytics.js', 'pwa.js', 'nav.js',
  'categorias.js', 'quickadd.js', 'dashboard.js', 'cuentas.js', 'gastos.js', 'presupuestos.js',
  'metas.js', 'deudas.js', 'transferencias.js', 'recurrentes.js',
  'reporte.js', 'cuotas.js', 'salario.js', 'configuracion.js'
];

async function buildJS() {
  const chartJs = await getChartJs();
  const modules = MODULE_ORDER
    .filter(f => fs.existsSync(path.join('src/modules', f)))
    .map(f => {
      const content = fs.readFileSync(path.join('src/modules', f), 'utf8');
      const cleaned = content.replace(/if\s*\(typeof module[\s\S]*?^}/gm, '');
      return `(function(){\n${cleaned}\n})();`;
    });
  return `/* Chart.js */\n${chartJs}\n/* MisFinanzas modules */\n${modules.join('\n')}`;
}

function buildHTML(css, js) {
  let html = fs.readFileSync('src/index.html', 'utf8');

  html = html.replace(/<link rel="stylesheet"[^>]+>\n?/g, '');
  html = html.replace('</head>', () => `  <style>\n${css}\n  </style>\n</head>`);

  html = html.replace(/<script src="modules\/[^"]+"><\/script>\n?/g, '');
  html = html.replace(
    /<!-- JS[\s\S]*?<!-- Inicialización de la app -->\s*<script>[\s\S]*?<\/script>/,
    () => `<script>\nwindow.MF = window.MF || {};\n${js}\nMF.pwa.init();\nMF.nav.init();\n</script>`
  );

  return html;
}

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f45"/><stop offset="1" stop-color="#191a24"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7aa2f7"/><stop offset="1" stop-color="#bb9af7"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#b)"/><g transform="translate(56,56) scale(16.6667)" fill="none" stroke="url(#g)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6V18M9 15.1818L9.87887 15.841C11.0504 16.7197 12.9498 16.7197 14.1214 15.841C15.2929 14.9623 15.2929 13.5377 14.1214 12.659C13.5355 12.2196 12.7677 12 11.9999 12C11.275 12 10.5502 11.7804 9.99709 11.341C8.891 10.4623 8.891 9.03772 9.9971 8.15904C11.1032 7.28036 12.8965 7.28036 14.0026 8.15904L14.4175 8.48863M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"/></g></svg>`;

const APP_ICON_URI = 'data:image/svg+xml,' + encodeURIComponent(APP_ICON_SVG);

const MANIFEST = {
  name: 'MisFinanzas · Finanzas personales',
  short_name: 'MisFinanzas',
  description: 'Control de finanzas personales 100% offline: gastos, presupuestos, metas y salud financiera.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#1e1f2e',
  theme_color: '#1e1f2e',
  icons: [
    { src: APP_ICON_URI, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    { src: APP_ICON_URI, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
  ]
};

async function main() {
  console.log('Building MisFinanzas v2...');

  ensureDir('dist');

  console.log('CSS:');
  const css = await buildCSS();

  console.log('JS:');
  const js = await buildJS();

  console.log('HTML...');
  const html = buildHTML(css, js);
  fs.writeFileSync('dist/index.html', html);

  console.log('SW...');
  fs.copyFileSync('src/sw.js', 'dist/sw.js');

  // Atajo de iOS ya firmado (shortcuts sign -m anyone); se publica junto a la app.
  if (fs.existsSync('MisFinanzas.shortcut')) {
    console.log('Shortcut...');
    fs.copyFileSync('MisFinanzas.shortcut', 'dist/MisFinanzas.shortcut');
  }

  console.log('Manifest...');
  fs.writeFileSync('dist/manifest.json', JSON.stringify(MANIFEST, null, 2));

  const size = (fs.statSync('dist/index.html').size / 1024).toFixed(1);
  console.log(`\nDone! dist/index.html — ${size} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
