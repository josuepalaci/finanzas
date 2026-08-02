// test/categorias.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};

const { DEFAULT_CATS, getCatColor, visibleCatNames } = require('../src/modules/categorias');

describe('DEFAULT_CATS', () => {
  test('se exporta como array no vacío', () => {
    assert.ok(Array.isArray(DEFAULT_CATS));
    assert.ok(DEFAULT_CATS.length > 0);
  });

  test('incluye la categoría Apple Pay', () => {
    const cat = DEFAULT_CATS.find(c => c.name === 'Apple Pay');
    assert.ok(cat, 'falta la categoría Apple Pay');
    assert.equal(typeof cat.color, 'string');
    assert.equal(typeof cat.icon, 'string');
  });

  test('cada categoría tiene name, color e icon', () => {
    for (const c of DEFAULT_CATS) {
      assert.equal(typeof c.name, 'string');
      assert.ok(c.name.length > 0);
      assert.match(c.color, /^#[0-9a-f]{6}$/i);
      assert.ok(c.icon.length > 0);
    }
  });

  test('no hay nombres duplicados', () => {
    const nombres = DEFAULT_CATS.map(c => c.name);
    assert.equal(new Set(nombres).size, nombres.length);
  });

  test('getCatColor resuelve el color de Apple Pay', () => {
    assert.equal(getCatColor('Apple Pay', { categories: [] }), '#a9b1d6');
  });
});

describe('visibleCatNames', () => {
  test('incluye predeterminadas y personalizadas', () => {
    const db = { categories: [{ name: 'Mascotas' }], settings: {} };
    const names = visibleCatNames(db);
    assert.ok(names.includes('Alimentación'));
    assert.ok(names.includes('Mascotas'));
  });

  test('excluye predeterminadas ocultas con settings.hiddenCats', () => {
    const db = { categories: [], settings: { hiddenCats: ['Ropa', 'Educación'] } };
    const names = visibleCatNames(db);
    assert.ok(!names.includes('Ropa'));
    assert.ok(!names.includes('Educación'));
    assert.ok(names.includes('Alimentación'));
  });

  test('excluye personalizadas con hidden:true', () => {
    const db = { categories: [{ name: 'Mascotas', hidden: true }], settings: {} };
    assert.ok(!visibleCatNames(db).includes('Mascotas'));
  });

  test('no duplica cuando una personalizada repite un nombre predeterminado', () => {
    const db = { categories: [{ name: 'Ropa' }], settings: {} };
    const names = visibleCatNames(db);
    assert.equal(names.filter(n => n === 'Ropa').length, 1);
  });

  test('tolera db sin settings ni categories', () => {
    const names = visibleCatNames({});
    assert.ok(names.length >= DEFAULT_CATS.length);
  });
});
