#!/usr/bin/env node
'use strict';
/*
 * Auditoría de EEFF Consolidados en un navegador real.
 *
 * Complementa a verificar.js: aquella prueba la lógica sin navegador; esta abre
 * la aplicación en Chromium, la recorre como lo haría una persona y reporta lo
 * que solo se ve al pintarla:
 *   - errores de JavaScript y de consola,
 *   - desbordes horizontales (contenido que se sale de la pantalla),
 *   - texto ilegible por falta de contraste,
 *   - flujos que dejan de funcionar (perfiles, respaldo, examen, papel de trabajo).
 *
 * Requisitos (no hacen falta para verificar.js):
 *     npm install playwright
 *     npx playwright install chromium
 *
 * Uso:
 *     node pruebas/auditoria-navegador.js
 *
 * Sale con código 0 si no hay hallazgos de tipo JS, CONSOLA, BUG o DESBORDE.
 * Los avisos de CONTRASTE se listan aparte porque incluyen falsos positivos
 * conocidos: el detector no puede leer los degradados de CSS y da por oscuro el
 * fondo de los elementos que los usan (los números de unidad de la barra
 * lateral, por ejemplo).
 */
const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Falta Playwright. Instálelo con:\n  npm install playwright\n  npx playwright install chromium');
  process.exit(2);
}

const APP = 'file:///' + path.join(__dirname, '..', 'EEFF_Consolidados.html').replace(/\\/g, '/');
const SALIDA = path.join(__dirname, 'auditoria-salida');
if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });

const hallazgos = [];
const anota = (nivel, donde, msg) => hallazgos.push({ nivel, donde, msg });

const PANTALLAS = {
  dashboard: '#goDashboard', glossary: '#goGlossary', casos: '#goCasos',
  exam: '#goExam', report: '#goReport', bibliography: '#goBibliography', manual: '#goManual'
};

// ---------------------------------------------------------------- utilidades

async function revisarDesborde(page, donde) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: document.documentElement.clientWidth,
    culpables: Array.from(document.querySelectorAll('body *'))
      .filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 2)
      .slice(0, 4)
      .map(e => `${e.tagName}.${(e.className || '').toString().split(' ')[0]}`)
  }));
  if (r.doc > r.win + 2) {
    anota('DESBORDE', donde, `scrollWidth ${r.doc} > ${r.win}. Candidatos: ${r.culpables.join(' | ')}`);
  }
}

async function revisarContraste(page, donde) {
  const malos = await page.evaluate(() => {
    const rgba = (c) => {
      const m = (c || '').match(/[\d.]+/g);
      return m ? { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] } : null;
    };
    // Compone las capas translúcidas hasta llegar a un fondo opaco.
    const fondoDe = (el) => {
      const capas = [];
      for (let n = el; n; n = n.parentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) capas.push(c);
        if (c && c.a === 1) break;
      }
      let base = capas.length && capas[capas.length - 1].a === 1
        ? capas.pop() : { r: 255, g: 255, b: 255, a: 1 };
      for (let i = capas.length - 1; i >= 0; i--) {
        const c = capas[i];
        base = {
          r: c.r * c.a + base.r * (1 - c.a),
          g: c.g * c.a + base.g * (1 - c.a),
          b: c.b * c.a + base.b * (1 - c.a), a: 1
        };
      }
      return base;
    };
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
    };
    const out = [];
    document.querySelectorAll('td, th, p, span, strong, li, h1, h2, h3, button, label').forEach(el => {
      if (!el.textContent.trim() || el.offsetParent === null || !visible(el)) return;
      const cs = getComputedStyle(el);
      if (cs.webkitTextFillColor === 'transparent' || cs.color === 'transparent') return;
      if (cs.visibility === 'hidden' || cs.opacity === '0') return;
      const texto = rgba(cs.color);
      if (!texto || texto.a < 0.5) return;
      if (Math.abs(lum(texto) - lum(fondoDe(el))) < 45) {
        out.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
      }
    });
    return [...new Set(out)].slice(0, 5);
  });
  malos.forEach(m => anota('CONTRASTE', donde, m));
}

// ------------------------------------------------- recorrido de las pantallas

async function recorrerPantallas(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('pageerror', e => anota('JS', vp.nombre, e.message));
  page.on('console', m => { if (m.type() === 'error') anota('CONSOLA', vp.nombre, m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(400);

  for (const tema of ['light', 'dark']) {
    await page.evaluate(t => localStorage.setItem('eeff_prefs_v1', JSON.stringify({ theme: t, font: 'normal' })), tema);
    await page.reload();
    await page.waitForTimeout(300);

    const cerrarCajon = async () => {
      if (await page.evaluate(() => document.querySelector('.sidebar').classList.contains('open'))) {
        await page.click('#backdrop');
        await page.waitForTimeout(200);
      }
    };
    const abrirCajon = async () => {
      if (vp.width >= 980) return;
      if (!await page.evaluate(() => document.querySelector('.sidebar').classList.contains('open'))) {
        await page.click('#menuToggle');
        await page.waitForTimeout(250);
      }
    };

    for (const [nombre, boton] of Object.entries(PANTALLAS)) {
      await cerrarCajon();
      await page.click(boton);
      await page.waitForTimeout(250);
      const donde = `${vp.nombre}/${tema}/${nombre}`;
      await revisarDesborde(page, donde);
      if (tema === 'dark') await revisarContraste(page, donde);
      const vacia = await page.evaluate(() => {
        const a = document.querySelector('.screen.active');
        return !a || a.innerHTML.trim().length < 50;
      });
      if (vacia) anota('BUG', donde, 'la pantalla quedó vacía');
    }

    for (let u = 0; u < 4; u++) {
      await abrirCajon();
      await page.click(`[data-unit="${u}"]`);
      await page.waitForTimeout(200);
      const pestanas = await page.$$eval('[data-tab]', n => n.map(e => e.dataset.tab));
      for (const t of pestanas) {
        await page.click(`[data-tab="${t}"]`);
        await page.waitForTimeout(200);
        const donde = `${vp.nombre}/${tema}/u${u + 1}-${t}`;
        await revisarDesborde(page, donde);
        if (tema === 'dark') await revisarContraste(page, donde);
      }
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------- flujos completos

async function recorrerFlujos(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => anota('JS', 'flujos', e.message));
  page.on('console', m => { if (m.type() === 'error') anota('CONSOLA', 'flujos', m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(300);

  let respuestaPrompt = 'clave-de-prueba';
  page.on('dialog', async d => {
    if (d.type() === 'prompt') await d.accept(respuestaPrompt);
    else await d.accept();
  });

  // Perfil: el nombre debe mostrarse literal, sin interpretarse como HTML.
  await page.fill('#profileName', 'Ana <b>Prueba</b>');
  await page.click('#saveProfile');
  await page.waitForTimeout(300);
  const titulo = await page.textContent('.hero h2');
  if (!titulo.includes('<b>')) anota('BUG', 'perfil', 'el nombre no se muestra literal: ' + titulo);

  // Notas: deben conservarse tal cual, con comillas y signos de menor/mayor.
  const textoNota = 'Nota con "comillas" & <etiqueta>';
  await page.click('[data-unit="0"]'); await page.waitForTimeout(200);
  await page.click('[data-tab="notas"]'); await page.waitForTimeout(200);
  await page.fill('#unitNotes', textoNota);
  await page.click('#saveNotes'); await page.waitForTimeout(300);
  await page.click('[data-tab="contenido"]'); await page.waitForTimeout(150);
  await page.click('[data-tab="notas"]'); await page.waitForTimeout(200);
  if (await page.inputValue('#unitNotes') !== textoNota) {
    anota('BUG', 'notas', 'las notas no se conservan tal cual');
  }

  // Conceptos: marcarlos todos debe acreditar avance.
  await page.click('[data-tab="contenido"]'); await page.waitForTimeout(200);
  const cuantos = (await page.$$('[data-concept]')).length;
  for (let i = 0; i < cuantos; i++) {
    const lista = await page.$$('[data-concept]');
    await lista[i].click();
    await page.waitForTimeout(80);
  }
  if (await page.textContent('[data-unit="0"] .done') === '0%') {
    anota('BUG', 'conceptos', 'marcar todos los conceptos no acredita avance');
  }

  // Simulador: un porcentaje mayor que 100 debe rechazarse.
  await page.click('[data-tab="simulador"]'); await page.waitForTimeout(250);
  await page.fill('#soldPercent', '150');
  await page.waitForTimeout(300);
  if (!(await page.textContent('#msg-soldPercent')).trim()) {
    anota('BUG', 'simulador', 'acepta un porcentaje mayor que 100');
  }

  // Autoevaluación: responder marca la pregunta y no mueve la página.
  await page.click('[data-tab="autoevaluacion"]'); await page.waitForTimeout(300);
  const opciones = await page.$$('.quiz-options button:not([disabled])');
  const ultima = opciones[opciones.length - 1];
  if (ultima) {
    await ultima.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const antes = await page.evaluate(() => window.scrollY);
    await ultima.click();
    await page.waitForTimeout(350);
    const despues = await page.evaluate(() => window.scrollY);
    if (antes > 100 && Math.abs(despues - antes) > 120) {
      anota('BUG', 'autoevaluacion', `la página se desplaza al responder (${antes} -> ${despues})`);
    }
    if (await page.$$eval('.quiz-feedback', n => n.length) < 1) {
      anota('BUG', 'autoevaluacion', 'no aparece la retroalimentación');
    }
    if (await page.$$eval('.quiz-options button[disabled]', n => n.length) < 3) {
      anota('BUG', 'autoevaluacion', 'la pregunta respondida sigue aceptando clics');
    }
  }

  // Papel de trabajo: sin conciliar las partidas en tránsito debe descuadrar.
  await page.click('[data-unit="1"]'); await page.waitForTimeout(200);
  await page.click('[data-tab="papel"]'); await page.waitForTimeout(300);
  await page.fill('#ws-transito', '0');
  await page.click('#wsCalc'); await page.waitForTimeout(300);
  if (await page.$$eval('.ws-check.bad', n => n.length) === 0) {
    anota('BUG', 'papel u2', 'sin conciliar el tránsito no se reporta descuadre');
  }
  await page.click('#wsReset'); await page.waitForTimeout(300);

  // Examen: el reloj avanza, la opción queda marcada y no se reinicia el reloj.
  await page.click('#goExam'); await page.waitForTimeout(300);
  const empezar = await page.$('#examBegin');
  if (empezar) { await empezar.click(); await page.waitForTimeout(500); }
  const reloj1 = await page.textContent('#examClock');
  await page.waitForTimeout(2200);
  if (await page.textContent('#examClock') === reloj1) anota('BUG', 'examen', 'el reloj no avanza');
  const primera = await page.$('[data-exam="0"]');
  if (primera) { await primera.click(); await page.waitForTimeout(250); }
  if (await page.$$eval('[data-exam="0"]', n => n.filter(e => e.classList.contains('elegida')).length) !== 1) {
    anota('BUG', 'examen', 'la opción marcada no queda resaltada');
  }
  if (await page.textContent('#examClock') === '20:00') anota('BUG', 'examen', 'el reloj se reinició al responder');
  if (!(await page.textContent('#examContador')).startsWith('1 de')) {
    anota('BUG', 'examen', 'el contador de respondidas no se actualiza');
  }
  await page.click('#examCancel'); await page.waitForTimeout(400);

  // Respaldo: descargar, comprobar contenido y volver a importarlo.
  await page.click('#goReport'); await page.waitForTimeout(300);
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#backupProfile')]);
  const ruta = path.join(SALIDA, 'respaldo.json');
  await descarga.saveAs(ruta);
  const respaldo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (!respaldo.perfiles || !Object.keys(respaldo.perfiles).length) {
    anota('BUG', 'respaldo', 'el archivo descargado no trae perfiles');
  }

  // Datos del curso: deben encabezar el reporte.
  await page.fill('#curso-institucion', 'Universidad de prueba');
  await page.fill('#curso-curso', 'Contabilidad Avanzada');
  await page.click('#saveCurso'); await page.waitForTimeout(300);
  if (!(await page.textContent('#reportScreen .panel-head h2')).includes('Universidad de prueba')) {
    anota('BUG', 'curso', 'el encabezado no toma los datos del curso');
  }

  // Rol docente: da acceso al panel de grupo y a la exportación.
  await page.selectOption('#roleSelect', 'docente');
  await page.waitForTimeout(600);
  if (await page.inputValue('#roleSelect') !== 'docente') {
    anota('BUG', 'rol', 'no se pudo activar el rol docente');
  }
  await page.click('#goReport'); await page.waitForTimeout(400);
  if (!await page.$('#exportGroupCsv')) {
    anota('BUG', 'panel grupo', 'el rol docente no ve el panel de grupo');
  } else {
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#exportGroupCsv')]);
    const rutaCsv = path.join(SALIDA, 'grupo.csv');
    await csv.saveAs(rutaCsv);
    const texto = fs.readFileSync(rutaCsv, 'utf8');
    if (!texto.includes('Perfil') || texto.split('\r\n').length < 2) {
      anota('BUG', 'csv', 'el CSV de grupo sale incompleto');
    }
  }

  // Importar el respaldo descargado (mismo nombre: se acepta reemplazar).
  await page.setInputFiles('#importFile', ruta);
  await page.waitForTimeout(900);

  // Renombrar y reiniciar.
  respuestaPrompt = 'Ana Renombrada';
  await page.click('#renameActiveProfile'); await page.waitForTimeout(500);
  if (await page.inputValue('#profileName') !== 'Ana Renombrada') {
    anota('BUG', 'renombrar', 'el perfil no quedó renombrado');
  }
  await page.click('#resetActiveProfile'); await page.waitForTimeout(500);
  if (!(await page.textContent('#reportScreen .badge.blue')).includes('0%')) {
    anota('BUG', 'reiniciar', 'el avance no volvió a 0');
  }
  const nav = await page.$$eval('.nav .done', n => n.map(e => e.textContent));
  if (nav.some(v => v !== '0%')) anota('BUG', 'reiniciar', 'la barra lateral conserva avance: ' + nav.join(','));

  await ctx.close();
}

// ------------------------------------------------------------------ ejecución

(async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of [
      { nombre: 'escritorio', width: 1440, height: 900 },
      { nombre: 'tablet', width: 820, height: 1180 },
      { nombre: 'movil', width: 390, height: 844 }
    ]) {
      await recorrerPantallas(browser, vp);
    }
    await recorrerFlujos(browser);
  } finally {
    await browser.close();
  }

  const clave = (h) => `${h.nivel}|${h.donde}|${h.msg}`;
  const unicos = [...new Map(hallazgos.map(h => [clave(h), h])).values()];
  const graves = unicos.filter(h => h.nivel !== 'CONTRASTE');
  const contraste = unicos.filter(h => h.nivel === 'CONTRASTE');

  if (graves.length) {
    console.log('HALLAZGOS:');
    graves.forEach(h => console.log(`  [${h.nivel}] ${h.donde}: ${h.msg}`));
  } else {
    console.log('Sin errores de JavaScript, consola, desbordes ni fallos de flujo.');
  }
  if (contraste.length) {
    const elementos = [...new Set(contraste.map(h => h.msg))];
    console.log(`\nAvisos de contraste (revisar a ojo, incluyen falsos positivos por degradados): ${elementos.join(', ')}`);
  }
  console.log(`\nResumen: ${graves.length} hallazgo(s) grave(s), ${contraste.length} aviso(s) de contraste.`);
  if (graves.length) process.exitCode = 1;
})();
