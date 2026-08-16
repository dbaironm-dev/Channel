// Ejecuta el nodo "Seleccionar dormidos" fuera de n8n, con las hojas de ejemplo,
// simulando $('...').all() / $('...').first() y congelando el reloj.
const fs = require('fs');
const vm = require('vm');

const RAIZ = __dirname + '/..';
const wf = JSON.parse(fs.readFileSync(RAIZ + '/workflows/01-reactivacion-dormidos.json', 'utf8'));
const code = wf.nodes.find(n => n.name === 'Seleccionar dormidos').parameters.jsCode;

// Lector de CSV mínimo con soporte de comillas.
function leerCsv(ruta) {
  const txt = fs.readFileSync(ruta, 'utf8').trim();
  const filas = []; let campo = '', fila = [], q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i+1] === '"') { campo += '"'; i++; } else if (c === '"') q = false; else campo += c; }
    else if (c === '"') q = true;
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

function fijarFecha(iso) {
  const Real = Date;
  return class extends Real {
    constructor(...a) { super(...(a.length ? a : [iso])); }
    static now() { return new Real(iso).getTime(); }
    static parse(s) { return Real.parse(s); }
  };
}

// Lunes 10:00 en Chicago (y 09:00 en CDMX): dentro de horario para ambos.
const LUNES_10AM = '2026-08-17T15:00:00.000Z';

function correr(config, clientesExtra = [], ahoraIso = LUNES_10AM, negociosParche = null) {
  const datos = {
    ...hojas,
    'Leer clientes': [...hojas['Leer clientes'], ...clientesExtra],
    'Leer negocios': negociosParche ?? hojas['Leer negocios'],
  };
  const $ = nombre => ({
    all: () => (nombre === 'Config' ? [{ json: config }] : (datos[nombre] || []).map(json => ({ json }))),
    first: () => (nombre === 'Config' ? { json: config } : { json: (datos[nombre] || [])[0] }),
  });
  const logs = [];
  const ctx = vm.createContext({
    $, console: { log: m => logs.push(String(m)) },
    JSON, Date: fijarFecha(ahoraIso), Intl, Number, String, Math, Object, Array, Set, isNaN,
    encodeURIComponent,
  });
  return { items: vm.runInContext('(function(){' + code + '})()', ctx), logs };
}

const CFG = {
  sheet_id: 'x', twilio_account_sid: 'ACxxx', graph_version: 'v21.0',
  modo_prueba: 'si', tam_lote: 5, espera_entre_lotes_seg: 20,
};

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

console.log('\n--- Escenario base ---');
const base = correr(CFG);
base.logs.forEach(l => console.log('  log: ' + l));
const ids = base.items.map(i => i.json.cliente_id);
console.log('  seleccionados: ' + JSON.stringify(ids));

check('c001 (dormido 58d, con consentimiento) entra', ids.includes('c001'));
check('c004 (dormido 50d) entra', ids.includes('c004'));
check('c002 (visita reciente + cita futura) NO entra', !ids.includes('c002'));
check('c003 (optout=si) NO entra', !ids.includes('c003'));
check('c005 (consentimiento=no) NO entra', !ids.includes('c005'));
check('c101 del negocio de WhatsApp entra', ids.includes('c101'));

console.log('\n--- Canal SMS (Texas) ---');
const sms = base.items.find(i => i.json.cliente_id === 'c001').json;
check('canal sms', sms.canal === 'sms', sms.canal);
check('no arma payload de WhatsApp', sms.payload === null);
check('arma formulario para Twilio', sms.sms_form.includes('To=%2B12145550001'), sms.sms_form.slice(0, 60));
check('usa Messaging Service, no From', sms.sms_form.includes('MessagingServiceSid=MG'));
check('sustituye {nombre}', sms.sms_texto.includes('Juan'));
check('sustituye {negocio}', sms.sms_texto.includes('Lone Star'));
check('sustituye {servicio}', sms.sms_texto.includes('corte y barba'));
check('no deja marcadores sin sustituir', !/\{[a-z_]+\}/.test(sms.sms_texto), sms.sms_texto);
check('lleva instrucción de opt-out', /STOP/i.test(sms.sms_texto));
console.log('  texto: "' + sms.sms_texto + '"');

console.log('\n--- Segmentos y costo real ---');
check('el texto de ejemplo es GSM-7', sms.encoding === 'GSM-7', sms.encoding);
check('cabe en 1 segmento', sms.segmentos === 1, String(sms.segmentos));
check('costo = 1 x 0.0109', sms.costo_estimado_usd === 0.0109, String(sms.costo_estimado_usd));
check('sin aviso de encoding', sms.aviso_encoding === '', sms.aviso_encoding);

// Una sola tilde saca el mensaje entero de GSM-7 y triplica el costo.
const conTilde = hojas['Leer negocios'].map(n => n.negocio_id === 'brb001'
  ? { ...n, sms_plantilla: '{negocio}: hola {nombre}, ya pasó un tiempo desde tu última visita. Te apartamos lugar esta semana para {servicio}? Responde SI. STOP para no recibir más.' }
  : n);
const rTilde = correr(CFG, [], LUNES_10AM, conTilde).items.find(i => i.json.cliente_id === 'c001').json;
check('una tilde fuerza UCS-2', rTilde.encoding === 'UCS-2', rTilde.encoding);
check('y sube a 3 segmentos', rTilde.segmentos === 3, String(rTilde.segmentos));
check('el costo se triplica', rTilde.costo_estimado_usd === 0.0327, String(rTilde.costo_estimado_usd));
check('avisa cuál carácter lo causó', rTilde.aviso_encoding.includes('ó'), rTilde.aviso_encoding);

const conEmoji = hojas['Leer negocios'].map(n => n.negocio_id === 'brb001'
  ? { ...n, sms_plantilla: 'Hola {nombre} \u{1F44B} te esperamos en {negocio}. STOP para salir.' } : n);
const rEmoji = correr(CFG, [], LUNES_10AM, conEmoji).items.find(i => i.json.cliente_id === 'c001').json;
check('un emoji fuerza UCS-2', rEmoji.encoding === 'UCS-2', rEmoji.encoding);
check('la ñ NO rompe GSM-7',
  correr(CFG, [], LUNES_10AM, hojas['Leer negocios'].map(n => n.negocio_id === 'brb001'
    ? { ...n, sms_plantilla: 'Hola {nombre}, manana te esperamos en la barberia. Senor, STOP para salir.' } : n))
    .items.find(i => i.json.cliente_id === 'c001').json.encoding === 'GSM-7');

console.log('\n--- Canal WhatsApp (México) ---');
const wa = base.items.find(i => i.json.cliente_id === 'c101').json;
check('canal whatsapp', wa.canal === 'whatsapp', wa.canal);
check('arma payload de plantilla', wa.payload?.type === 'template');
check('no arma formulario de Twilio', wa.sms_form === '');
check('3 parámetros de body', wa.payload.template.components[0].parameters.length === 3);
check('3 botones quick_reply', wa.payload.template.components.filter(c => c.type === 'button').length === 3);
check('costo = tarifa marketing MX', wa.costo_estimado_usd === 0.0305, String(wa.costo_estimado_usd));

console.log('\n--- Horario TCPA (8am-9pm; aquí 9-20 por margen) ---');
const tarde = correr(CFG, [], '2026-08-18T03:00:00.000Z'); // 22:00 en Chicago
check('22:00 local no envía nada', tarde.items.filter(i => i.json.negocio_id === 'brb001').length === 0);
check('y deja el motivo en el log', tarde.logs.some(l => l.includes('fuera_de_horario')));
const madrugada = correr(CFG, [], '2026-08-17T09:00:00.000Z'); // 04:00 en Chicago
check('04:00 local tampoco', madrugada.items.filter(i => i.json.negocio_id === 'brb001').length === 0);

console.log('\n--- Día de la semana en hora local, no UTC ---');
const domingo = correr(CFG, [], '2026-08-16T15:00:00.000Z'); // domingo 10:00 Chicago
check('domingo no envía (el local cierra)', domingo.items.length === 0);
check('el motivo queda registrado', domingo.logs.some(l => l.includes('hoy_no_abre')));

console.log('\n--- Reglas de exclusión ---');
const cli = (id, extra) => ({
  negocio_id: 'brb001', cliente_id: id, nombre: 'Test Uno', telefono: '12145559999',
  ultima_visita: '2026-06-20', servicio_habitual: 'fade', barbero_preferido: '', proxima_cita: '',
  consentimiento: 'si', fecha_consentimiento: '2026-01-01', origen_consentimiento: 'formulario en local',
  optout: 'no', ultimo_contacto: '', estado: 'dormido', visitas_totales: '3', ticket_promedio: '30', ...extra,
});
const sin = (id, extra) => !correr(CFG, [cli(id, extra)]).items.some(i => i.json.cliente_id === id);

check('teléfono corto descartado', sin('t1', { telefono: '5512' }));
check('dormido > umbral_max descartado', sin('t2', { ultima_visita: '2025-01-01' }));
check('con cita futura descartado', sin('t3', { proxima_cita: '2026-12-01' }));
check('contactado hoy (cooldown) descartado', sin('t4', { ultimo_contacto: '2026-08-17' }));
check('sin última visita descartado', sin('t5', { ultima_visita: '' }));
check('fecha inválida descartada sin reventar', sin('t6', { ultima_visita: '20/06/2026' }));
check('optout en mayúsculas respetado', sin('t7', { optout: 'SI' }));
check('sin consentimiento descartado', sin('t8', { consentimiento: '' }));

const t9 = correr(CFG, [cli('t9', { telefono: '+1 (214) 555-7777' })]).items.find(i => i.json.cliente_id === 't9');
check('teléfono con formato se normaliza', !!t9 && t9.json.telefono === '12145557777', t9 && t9.json.telefono);

console.log('\n--- Tope diario y prioridad ---');
const muchos = Array.from({ length: 60 }, (_, k) => cli('m' + k, { telefono: '121455' + String(k).padStart(5, '0') }));
const tope = correr(CFG, muchos).items.filter(i => i.json.negocio_id === 'brb001').length;
check('respeta max_por_dia=40', tope === 40, String(tope));

const orden = correr(CFG, [
  cli('o1', { ultima_visita: '2026-04-25', telefono: '12145570001' }),
  cli('o2', { ultima_visita: '2026-06-30', telefono: '12145570002' }),
]).items.map(i => i.json.cliente_id);
check('el menos frío va primero', orden.indexOf('o2') < orden.indexOf('o1'),
  `o2=${orden.indexOf('o2')} o1=${orden.indexOf('o1')}`);

console.log('\n--- Modo producción ---');
check('modo_prueba=no => envio_real=true', correr({ ...CFG, modo_prueba: 'no' }).items[0].json.envio_real === true);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
