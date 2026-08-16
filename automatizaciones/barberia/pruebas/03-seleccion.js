// Ejecuta el nodo "Seleccionar dormidos" fuera de n8n, con las hojas de ejemplo,
// simulando $('...').all() y $('...').first().
const fs = require('fs');
const vm = require('vm');

const RAIZ = '/home/user/Channel/automatizaciones/barberia';
const wf = JSON.parse(fs.readFileSync(RAIZ + '/workflows/01-reactivacion-dormidos.json', 'utf8'));
const code = wf.nodes.find(n => n.name === 'Seleccionar dormidos').parameters.jsCode;

// Lector de CSV mínimo con soporte de comillas (dias_habiles viene entrecomillado).
function leerCsv(ruta) {
  const txt = fs.readFileSync(ruta, 'utf8').trim();
  const filas = [];
  let campo = '', fila = [], enComillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (enComillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.map(f => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

const hojas = {
  'Leer negocios': leerCsv(RAIZ + '/hojas/negocios.csv'),
  'Leer clientes': leerCsv(RAIZ + '/hojas/clientes.csv'),
  'Leer log':      leerCsv(RAIZ + '/hojas/log_mensajes.csv'),
  'Leer tarifas':  leerCsv(RAIZ + '/hojas/tarifas.csv'),
};

// Date congelado: las pruebas no pueden depender del día en que se ejecuten.
function fijarFecha(iso) {
  const Real = Date;
  return class extends Real {
    constructor(...a) { super(...(a.length ? a : [iso])); }
    static now() { return new Real(iso).getTime(); }
    static parse(s) { return Real.parse(s); }
  };
}

// Lunes 2026-08-17: día hábil para brb001 (dias_habiles = 1..6).
const LUNES = '2026-08-17T16:00:00.000Z';

function correr(config, clientesExtra = [], ahoraIso = LUNES) {
  const datos = { ...hojas, 'Leer clientes': [...hojas['Leer clientes'], ...clientesExtra] };
  const $ = nombre => ({
    all: () => (nombre === 'Config' ? [{ json: config }] : (datos[nombre] || []).map(json => ({ json }))),
    first: () => (nombre === 'Config' ? { json: config } : { json: (datos[nombre] || [])[0] }),
  });
  const logs = [];
  const ctx = vm.createContext({
    $, console: { log: m => logs.push(String(m)) },
    JSON, Date: fijarFecha(ahoraIso), Number, String, Math, Object, Array, Set, isNaN,
  });
  const res = vm.runInContext('(function(){' + code + '})()', ctx);
  return { items: res, logs };
}

const CFG = { sheet_id: 'x', graph_version: 'v21.0', modo_prueba: 'si', tam_lote: 5, espera_entre_lotes_seg: 20 };

let fallos = 0;
const check = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
  if (!cond) fallos++;
};

console.log('\n--- Escenario base (datos de ejemplo) ---');
const base = correr(CFG);
base.logs.forEach(l => console.log('  log: ' + l));
const ids = base.items.map(i => i.json.cliente_id);
console.log('  seleccionados: ' + JSON.stringify(ids));

check('c001 (dormido 57d, sin cita, sin optout) entra', ids.includes('c001'));
check('c004 (dormido 49d) entra', ids.includes('c004'));
check('c002 (visita reciente + cita futura) NO entra', !ids.includes('c002'));
check('c003 (optout=si) NO entra', !ids.includes('c003'));
check('ningún cliente de brb002 (inactivo) entra',
      !base.items.some(i => i.json.negocio_id === 'brb002'));

console.log('\n--- Forma del payload que se manda a la Cloud API ---');
const p = base.items.find(i => i.json.cliente_id === 'c001').json;
console.log('  ' + JSON.stringify(p.payload).slice(0, 200) + '...');
check('to sin símbolos', /^[0-9]{10,15}$/.test(p.payload.to), p.payload.to);
check('3 parámetros de body', p.payload.template.components[0].parameters.length === 3);
check('primer parámetro = nombre de pila', p.payload.template.components[0].parameters[0].text === 'Juan');
check('3 botones quick_reply', p.payload.template.components.filter(c => c.type === 'button').length === 3);
check('payload BAJA presente', JSON.stringify(p.payload).includes('"payload":"BAJA"'));
check('costo estimado = tarifa marketing MX', p.costo_estimado_usd === 0.0305, String(p.costo_estimado_usd));
check('modo_prueba=si => envio_real=false', p.envio_real === false);

console.log('\n--- Reglas de exclusión ---');
const hoy = LUNES.slice(0, 10);
const cli = (id, extra) => ({
  negocio_id: 'brb001', cliente_id: id, nombre: 'Test Uno', telefono: '5215599999999',
  ultima_visita: '2026-06-20', servicio_habitual: 'Fade', barbero_preferido: '', proxima_cita: '',
  optout: 'no', ultimo_contacto: '', estado: 'dormido', visitas_totales: '3', ticket_promedio: '300', ...extra,
});

const sinTel = correr(CFG, [cli('t1', { telefono: '55123' })]);
check('teléfono corto descartado', !sinTel.items.some(i => i.json.cliente_id === 't1'));

const frio = correr(CFG, [cli('t2', { ultima_visita: '2025-01-01' })]);
check('dormido > umbral_max (demasiado frío) descartado', !frio.items.some(i => i.json.cliente_id === 't2'));

const conCita = correr(CFG, [cli('t3', { proxima_cita: '2026-12-01' })]);
check('con cita futura descartado', !conCita.items.some(i => i.json.cliente_id === 't3'));

const cooldown = correr(CFG, [cli('t4', { ultimo_contacto: hoy })]);
check('contactado hoy (cooldown) descartado', !cooldown.items.some(i => i.json.cliente_id === 't4'));

const sinFecha = correr(CFG, [cli('t5', { ultima_visita: '' })]);
check('sin última visita descartado', !sinFecha.items.some(i => i.json.cliente_id === 't5'));

const fechaMala = correr(CFG, [cli('t6', { ultima_visita: '20/06/2026' })]);
check('fecha en formato inválido descartada (no revienta)', !fechaMala.items.some(i => i.json.cliente_id === 't6'));

const optMayus = correr(CFG, [cli('t7', { optout: 'SI' })]);
check('optout en mayúsculas respetado', !optMayus.items.some(i => i.json.cliente_id === 't7'));

const telFormato = correr(CFG, [cli('t8', { telefono: '+52 1 55 8888-8888' })]);
const t8 = telFormato.items.find(i => i.json.cliente_id === 't8');
check('teléfono con formato se normaliza', !!t8 && t8.json.telefono === '5215588888888', t8 && t8.json.telefono);

console.log('\n--- Tope diario ---');
const muchos = Array.from({ length: 60 }, (_, k) => cli('m' + k, { telefono: '52155000000' + String(k).padStart(2, '0') }));
const tope = correr(CFG, muchos);
const deBrb001 = tope.items.filter(i => i.json.negocio_id === 'brb001').length;
check('respeta max_por_dia=40', deBrb001 === 40, String(deBrb001));

console.log('\n--- Orden de prioridad ---');
const orden = correr(CFG, [
  cli('o1', { ultima_visita: '2026-04-25', telefono: '5215577770001' }),
  cli('o2', { ultima_visita: '2026-06-30', telefono: '5215577770002' }),
]);
const pos1 = orden.items.findIndex(i => i.json.cliente_id === 'o1');
const pos2 = orden.items.findIndex(i => i.json.cliente_id === 'o2');
check('el menos frío va primero', pos2 < pos1, `o2=${pos2} o1=${pos1}`);

console.log('\n--- Modo producción ---');
const prod = correr({ ...CFG, modo_prueba: 'no' });
check('modo_prueba=no => envio_real=true', prod.items[0].json.envio_real === true);

console.log('\n--- Días en que el local no abre ---');
const domingo = correr(CFG, [], '2026-08-16T16:00:00.000Z');
check('domingo no envía nada (brb001 cierra)', domingo.items.length === 0);
check('el motivo queda registrado', domingo.logs.some(l => l.includes('hoy_no_abre')));

console.log('\n--- Cooldown reconstruido desde el log ---');
// El log de ejemplo contactó a c001 el 2026-03-10 (160 días antes): cooldown vencido.
check('cooldown vencido => vuelve a entrar', ids.includes('c001'));
const reciente = correr(CFG, [], '2026-04-06T16:00:00.000Z'); // 27 días tras el contacto
check('cooldown vigente => no entra', !reciente.items.some(i => i.json.cliente_id === 'c001'));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
