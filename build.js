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
  'categorias.js', 'dashboard.js', 'cuentas.js', 'gastos.js', 'presupuestos.js',
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

const MANIFEST = {
  name: 'MisFinanzas',
  short_name: 'MisFinanzas',
  description: 'Control de finanzas personales — 100% offline',
  start_url: '/MisFinanzas.html',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#1e1f2e',
  theme_color: '#1e1f2e',
  icons: [{
    src: 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" rx="80" fill="#1e1f2e"/>
        <text x="256" y="340" text-anchor="middle" font-size="280" font-family="system-ui">💰</text>
      </svg>`),
    sizes: '512x512',
    type: 'image/svg+xml',
    purpose: 'any maskable'
  }]
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
  fs.writeFileSync('dist/MisFinanzas.html', html);

  console.log('SW...');
  fs.copyFileSync('src/sw.js', 'dist/sw.js');

  console.log('Manifest...');
  fs.writeFileSync('dist/manifest.json', JSON.stringify(MANIFEST, null, 2));

  const size = (fs.statSync('dist/MisFinanzas.html').size / 1024).toFixed(1);
  console.log(`\nDone! dist/MisFinanzas.html — ${size} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
