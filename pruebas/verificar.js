#!/usr/bin/env node
'use strict';
/*
 * Suite de regresion para EEFF Consolidados (app de un solo archivo HTML).
 * Ejecuta el JavaScript de la app dentro de stubs de DOM/localStorage y valida
 * pantallas, pestanas, calculos de simuladores y cuadre de asientos.
 *
 * Uso:  node pruebas/verificar.js
 * Sale con codigo 0 si todo pasa; distinto de 0 si algo falla.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ----------------------- Stubs de navegador -----------------------
function makeEl() {
  const el = {
    innerHTML: '', textContent: '', value: '', checked: false, open: false,
    className: '', id: '', href: '', download: '',
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: new Proxy({}, { get: () => '' }),
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild() { return makeEl(); }, remove() {}, click() {}, focus() {},
    setAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, querySelector() { return makeEl(); },
    matches() { return false; }
  };
  return el;
}
const els = {};
const docElement = makeEl();
docElement.dataset = { theme: 'light', font: 'normal' };
global.document = {
  documentElement: docElement,
  getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; },
  querySelectorAll() { return []; },
  querySelector() { return makeEl(); },
  createElement() { return makeEl(); },
  body: makeEl()
};
global.window = { matchMedia: () => ({ matches: false }), print() {} };
global.FileReader = function () { this.readAsText = () => {}; };
global.matchMedia = global.window.matchMedia;
global.localStorage = {
  d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.d, k) ? this.d[k] : null; },
  setItem(k, v) { this.d[k] = String(v); },
  removeItem(k) { delete this.d[k]; }
};
global.prompt = () => null;
global.confirm = () => true;
global.alert = () => {};
global.setTimeout = () => 0;
global.clearTimeout = () => {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = function () {};

// ----------------------- Cargar la app -----------------------
const htmlPath = path.join(__dirname, '..', 'EEFF_Consolidados.html');
const html = fs.readFileSync(htmlPath, 'utf8');
// Se toma solo el script principal de la app (el <head> lleva otro script corto
// que aplica el tema antes de pintar).
const match = html.match(/<script id="appScript">([\s\S]*?)<\/script>/);
if (!match) { console.error('No se encontro <script id="appScript"> en EEFF_Consolidados.html'); process.exit(1); }
const appJs = match[1];

// ----------------------- Pruebas (mismo ambito que la app) -----------------------
const tests = `
(function () {
  const R = [];
  const chk = (n, c, g) => R.push([!!c, n + (c || g === undefined ? '' : '  (got=' + g + ')')]);
  const T = (n, fn) => { try { fn(); R.push([true, n]); } catch (e) { R.push([false, n + '  -> ' + e.message]); } };
  const setV = (id, v) => { document.getElementById(id).value = String(v); };

  // Humo: pantallas
  T('Panel', () => { activeScreen = 'dashboard'; render(); });
  T('Glosario + busqueda', () => { activeScreen = 'glossary'; glossaryQuery = 'control'; render(); glossaryQuery = ''; });
  T('Bibliografia', () => { activeScreen = 'bibliography'; render(); });
  T('Manual de usuario', () => { activeScreen = 'manual'; render(); });
  ['todos','u1','u2','u3','u4','integrador'].forEach(f => T('Casos: ' + f, () => { activeScreen = 'casos'; casoFilter = f; renderCasos(); }));
  T('Reporte (estudiante)', () => { activeRole = 'estudiante'; activeScreen = 'report'; render(); });
  T('Reporte (docente)', () => { activeRole = 'docente'; elevated = true; activeScreen = 'report'; render(); });
  T('Reporte (administrador)', () => { activeRole = 'administrador'; activeScreen = 'report'; render(); });
  for (let i = 0; i < units.length; i++) {
    ['contenido','ejemplo','ejercicios','simulador','autoevaluacion','notas'].forEach(t =>
      T('Unidad ' + (i + 1) + ': ' + t, () => { activeScreen = 'unit'; activeUnit = i; activeTab = t; renderUnit(); }));
  }
  T('Exportar grupo CSV', () => exportGroupCsv());
  T('Exportar grupo JSON', () => exportGroupJson());
  T('Imprimir unidad (PDF)', () => { activeUnit = 0; printUnit(); });

  // Logica y calculos
  chk('Pesos de avance suman 100%', ACTIVITY_ITEMS.reduce((s, i) => s + i.weight, 0) === 100);
  chk('fmtImporte("(60000)") formatea', fmtImporte('(60000)') === '(' + money(60000) + ')', fmtImporte('(60000)'));
  chk('fmtAmount deja texto intacto', fmtAmount('80%') === '80%', fmtAmount('80%'));
  chk('fmtImporte no re-corrompe valor ya formateado', fmtImporte(money(90000)) === money(90000), fmtImporte(money(90000)));

  setV('inventoryCost', 100000); setV('soldPercent', 80); setV('salesAmount', 128000); setV('distributionExpense', 6000);
  calculateSimulator(units[0]);
  chk('Simulador U1: resultado 42000', document.getElementById('simResult').innerHTML.includes(money(42000)));

  setV('ownership', 80); setV('purchasePrice', 160000); setV('subEquity', 200000); setV('subProfit', 40000); setV('dividends', 10000);
  calculateSimulator(units[2]);
  chk('Simulador U3: saldo participacion 184000', document.getElementById('simResult').innerHTML.includes(money(184000)));

  setV('associatePct', 30); setV('initialCost', 90000); setV('associateProfit', 60000); setV('associateDividends', 12000);
  calculateSimulator(units[3]);
  chk('Simulador U4: saldo final 104400', document.getElementById('simResult').innerHTML.includes(money(104400)));

  let cuadran = true, mal = '';
  casos.forEach(c => c.asientos.forEach(a => {
    let d = 0, h = 0;
    a.rows.forEach(r => { d += Number(String(r[1]).replace(/[^0-9.]/g, '')) || 0; h += Number(String(r[2]).replace(/[^0-9.]/g, '')) || 0; });
    if (Math.round(d) !== Math.round(h)) { cuadran = false; mal = c.id + ' / ' + a.descripcion; }
  }));
  chk('Asientos de todos los casos cuadran (Debe=Haber)', cuadran, mal);

  chk('Casos con estructura completa', casos.every(c => c.titulo && c.enunciado && Array.isArray(c.datos) && Array.isArray(c.asientos) && c.niif18));

  units.forEach(u => { const a = unitActivity(u.id); Object.keys(a).forEach(k => delete a[k]); });
  const p = profile(); p.quiz = {}; p.complete = {};
  chk('unitProgress inicial = 0', unitProgress(units[0]) === 0, unitProgress(units[0]));

  const fails = R.filter(x => !x[0]);
  R.forEach(([okk, n]) => console.log((okk ? '  OK    ' : '  FALLA ') + '| ' + n));
  console.log(fails.length ? ('\\n>> ' + fails.length + ' de ' + R.length + ' comprobaciones FALLARON') : ('\\n>> TODAS OK (' + R.length + ' comprobaciones)'));
  if (fails.length) process.exitCode = 1;
})();
`;

try {
  vm.runInThisContext(appJs + '\n' + tests, { filename: 'EEFF_Consolidados.inline.js' });
} catch (e) {
  console.error('ERROR al cargar/ejecutar la app:', e.stack || e.message);
  process.exit(1);
}
