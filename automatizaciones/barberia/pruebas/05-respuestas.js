// Prueba los nodos del workflow 02 con sobres reales de la Cloud API.
const fs = require('fs');
const vm = require('vm');

const RAIZ = '/home/user/Channel/automatizaciones/barberia';
const wf = JSON.parse(fs.readFileSync(RAIZ + '/workflows/02-respuestas-whatsapp.json', 'utf8'));
const codigo = n => wf.nodes.find(x => x.name === n).parameters.jsCode;

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

const NEGOCIOS = leerCsv(RAIZ + '/hojas/negocios.csv');
const CLIENTES = leerCsv(RAIZ + '/hojas/clientes.csv');

const BASE = { JSON, Date, Number, String, Math, Object, Array, Set, isNaN, RegExp };

function normalizar(sobre) {
  const ctx = vm.createContext({ ...BASE, $input: { all: () => [{ json: sobre }] }, console: { log() {} } });
  return vm.runInContext('(function(){' + codigo('Normalizar evento') + '})()', ctx).map(i => i.json);
}

function interpretar(ev) {
  const $ = n => ({ all: () => (n === 'Leer negocios' ? NEGOCIOS : CLIENTES).map(json => ({ json })) });
  const ctx = vm.createContext({ ...BASE, $, $json: ev, console: { log() {} } });
  return vm.runInContext('(function(){' + codigo('Interpretar respuesta') + '})()', ctx).json;
}

function acuse(ev) {
  const ctx = vm.createContext({ ...BASE, $json: ev, console: { log() {} } });
  return vm.runInContext('(function(){' + codigo('Interpretar acuse') + '})()', ctx).json;
}

// Sobre tal como lo manda Meta.
const sobre = (value) => ({ object: 'whatsapp_business_account', entry: [{ id: '102...', changes: [{ field: 'messages', value }] }] });
const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '5215512345678', phone_number_id: '123456789012345' } };
const msg = (m, waId = '525511111111', nombre = 'Juan Pérez') => sobre({
  ...meta, contacts: [{ profile: { name: nombre }, wa_id: waId }], messages: [{ from: waId, id: 'wamid.IN1', timestamp: '1755350000', ...m }],
});

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

console.log('\n--- Normalización del sobre de Meta ---');
const evs = normalizar(msg({ type: 'button', button: { payload: 'AGENDAR', text: 'Sí, agéndame' } }));
check('un evento', evs.length === 1);
check('clase mensaje', evs[0].clase === 'mensaje');
check('extrae el payload del botón', evs[0].payload_boton === 'AGENDAR', evs[0].payload_boton);
check('extrae phone_number_id', evs[0].phone_number_id === '123456789012345');
check('extrae nombre de perfil', evs[0].nombre_perfil === 'Juan Pérez');

const mixto = normalizar(sobre({ ...meta,
  contacts: [{ profile: { name: 'A' }, wa_id: '525511111111' }],
  messages: [{ from: '525511111111', id: 'wamid.A', type: 'text', text: { body: 'hola' } }],
  statuses: [{ id: 'wamid.B', status: 'delivered', recipient_id: '525511111111', pricing: { billable: true, category: 'marketing' } }],
}));
check('separa mensajes y acuses en el mismo POST',
  mixto.length === 2 && mixto[0].clase === 'mensaje' && mixto[1].clase === 'estado',
  JSON.stringify(mixto.map(e => e.clase)));
check('sobre vacío no revienta', normalizar({ object: 'x' }).length === 0);

console.log('\n--- El problema del 52 vs 521 en México ---');
// La hoja guarda 5215511111111; Meta responde desde 525511111111.
const ident = interpretar(normalizar(msg({ type: 'button', button: { payload: 'AGENDAR', text: 'Sí' } }, '525511111111'))[0]);
check('identifica al cliente pese al 1 faltante', ident.encontrado === true);
check('cliente correcto', ident.cliente_id === 'c001', ident.cliente_id);
check('negocio resuelto', ident.negocio_id === 'brb001', ident.negocio_id);

const identInv = interpretar(normalizar(msg({ type: 'text', text: { body: 'si' } }, '5215511111111'))[0]);
check('identifica también con el formato original', identInv.cliente_id === 'c001', identInv.cliente_id);

console.log('\n--- Intenciones por botón ---');
for (const [payload, esperada] of [['AGENDAR', 'agendar'], ['AHORA_NO', 'ahora_no'], ['BAJA', 'baja']]) {
  const r = interpretar(normalizar(msg({ type: 'button', button: { payload, text: 'x' } }))[0]);
  check(`botón ${payload} -> ${esperada}`, r.intencion === esperada, r.intencion);
}

console.log('\n--- Intenciones por texto libre ---');
const porTexto = t => interpretar(normalizar(msg({ type: 'text', text: { body: t } }))[0]).intencion;
check('"Sí" con acento y mayúscula -> agendar', porTexto('Sí') === 'agendar', porTexto('Sí'));
check('"BAJA" -> baja', porTexto('BAJA') === 'baja', porTexto('BAJA'));
check('"ya no quiero mensajes" -> baja', porTexto('ya no quiero mensajes') === 'baja', porTexto('ya no quiero mensajes'));
check('"dale, apártame" -> agendar', porTexto('dale, apártame') === 'agendar', porTexto('dale, apártame'));
check('"ahora no gracias" -> ahora_no', porTexto('ahora no gracias') === 'ahora_no', porTexto('ahora no gracias'));
check('"cuánto cuesta el fade?" -> otro (lo ve un humano)', porTexto('cuánto cuesta el fade?') === 'otro', porTexto('cuánto cuesta el fade?'));

console.log('\n--- Efectos de cada intención ---');
const baja = interpretar(normalizar(msg({ type: 'button', button: { payload: 'BAJA', text: 'x' } }))[0]);
check('baja marca optout=si', baja.nuevo_optout === 'si', baja.nuevo_optout);
check('baja NO molesta al dueño', baja.avisar_dueno === false);
check('baja confirma al cliente', baja.respuesta_cliente.text.body.includes('no volverás a recibir'));
check('baja no se cobra', baja.fila_log.costo_estimado_usd === 0);

const agendar = interpretar(normalizar(msg({ type: 'button', button: { payload: 'AGENDAR', text: 'x' } }))[0]);
check('agendar avisa al dueño', agendar.avisar_dueno === true);
check('aviso va al teléfono del dueño', agendar.aviso_dueno.to === '5215512345678', agendar.aviso_dueno.to);
check('aviso usa plantilla utility', agendar.aviso_dueno.template.name === 'aviso_cliente_interesado_v1');
check('aviso lleva 3 parámetros', agendar.aviso_dueno.template.components[0].parameters.length === 3);
check('el teléfono del cliente va en el aviso',
  agendar.aviso_dueno.template.components[0].parameters[2].text === '525511111111');
check('marca agendo=si en el log', agendar.fila_log.agendo === 'si');
check('estado del cliente = interesado', agendar.nuevo_estado === 'interesado');

const ahoraNo = interpretar(normalizar(msg({ type: 'button', button: { payload: 'AHORA_NO', text: 'x' } }))[0]);
check('ahora_no NO molesta al dueño', ahoraNo.avisar_dueno === false);
check('ahora_no mantiene optout=no', ahoraNo.nuevo_optout === 'no', ahoraNo.nuevo_optout);

console.log('\n--- Número desconocido ---');
const desconocido = interpretar(normalizar(msg({ type: 'text', text: { body: 'hola' } }, '525599998888', 'Ana'))[0]);
check('no revienta', !!desconocido);
check('marca que no lo identificó', desconocido.encontrado === false);
check('no intenta actualizar una ficha inexistente', desconocido.actualizar_cliente === false);
check('resuelve el negocio por phone_number_id', desconocido.negocio_id === '' && desconocido.aviso_dueno !== null);
check('usa el nombre del perfil de WhatsApp', desconocido.respuesta_cliente.text.body.includes('Ana'));
check('escala al operador', desconocido.fila_log.accion === 'avisar_operador');

console.log('\n--- Acuses de entrega ---');
const ent = acuse(normalizar(sobre({ ...meta, statuses: [{ id: 'wamid.B', status: 'delivered', recipient_id: '52...', pricing: { billable: true, pricing_model: 'PMP', category: 'marketing' } }] }))[0]);
check('traduce delivered -> entregado', ent.estado === 'entregado', ent.estado);
check('captura facturable de Meta', ent.facturable === 'si', ent.facturable);
check('captura la categoría real', ent.categoria === 'marketing', ent.categoria);

const fallo = acuse(normalizar(sobre({ ...meta, statuses: [{ id: 'wamid.C', status: 'failed', errors: [{ code: 131049, title: 'Unable to deliver' }], pricing: { billable: false } }] }))[0]);
check('failed -> fallido', fallo.estado === 'fallido', fallo.estado);
check('failed escala al operador', fallo.accion === 'avisar_operador');
check('failed no es facturable', fallo.facturable === 'no', fallo.facturable);
check('guarda el motivo', fallo.error_mensaje.includes('131049'), fallo.error_mensaje);

console.log('\n--- Forma de la fila de log ---');
const COLS = fs.readFileSync(RAIZ + '/hojas/log_mensajes.csv', 'utf8').split('\n')[0].trim().split(',');
const claves = Object.keys(agendar.fila_log);
check('coincide con las columnas de la hoja',
  JSON.stringify(claves.slice().sort()) === JSON.stringify(COLS.slice().sort()),
  'sobran: ' + claves.filter(k => !COLS.includes(k)) + ' | faltan: ' + COLS.filter(k => !claves.includes(k)));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
