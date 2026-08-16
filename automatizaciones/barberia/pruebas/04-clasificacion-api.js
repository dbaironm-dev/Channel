// Prueba el nodo "Clasificar envío" con respuestas reales de la Cloud API.
const fs = require('fs');
const vm = require('vm');

const wf = JSON.parse(fs.readFileSync('/home/user/Channel/automatizaciones/barberia/workflows/01-reactivacion-dormidos.json', 'utf8'));
const code = wf.nodes.find(n => n.name === 'Clasificar envío').parameters.jsCode;

const ORIGEN = {
  negocio_id: 'brb001', cliente_id: 'c001', telefono: '5215511111111',
  categoria: 'marketing', plantilla: 'reactivacion_barberia_v1',
  costo_estimado_usd: 0.0305, dias_dormido: 58,
};

function clasificar(respuesta) {
  const $ = nombre => ({ item: { json: nombre === 'Lote de envío' ? ORIGEN : {} } });
  const ctx = vm.createContext({ $, $json: respuesta, JSON, Date, Number, String, Math, Object });
  return vm.runInContext('(function(){' + code + '})()', ctx).json;
}

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

console.log('\n--- Envío correcto (200) ---');
const ok = clasificar({
  statusCode: 200,
  body: {
    messaging_product: 'whatsapp',
    contacts: [{ input: '5215511111111', wa_id: '5215511111111' }],
    messages: [{ id: 'wamid.HBgNNTIxNTUxMTExMTExMRUCABEYEjhBM0Y5', message_status: 'accepted' }],
  },
});
check('estado enviado', ok.estado === 'enviado', ok.estado);
check('guarda el wamid', ok.wamid.startsWith('wamid.'), ok.wamid);
check('cobra el costo estimado', ok.costo_estimado_usd === 0.0305, String(ok.costo_estimado_usd));
check('sin acción pendiente', ok.accion === 'ninguna', ok.accion);

console.log('\n--- Plantilla no aprobada (132001) ---');
const tpl = clasificar({
  statusCode: 400,
  body: { error: { message: 'Template name does not exist in the translation', code: 132001, error_data: { details: 'template name (reactivacion_barberia_v1) does not exist in es_MX' } } },
});
check('estado error', tpl.estado === 'error', tpl.estado);
check('código 132001', tpl.error_code === '132001', tpl.error_code);
check('diagnóstico en español', tpl.diagnostico.includes('no está aprobada'), tpl.diagnostico);
check('escala al operador', tpl.accion === 'avisar_operador', tpl.accion);
check('NO cobra un envío fallido', tpl.costo_estimado_usd === 0, String(tpl.costo_estimado_usd));

console.log('\n--- Número sin WhatsApp (131026) ---');
const nowa = clasificar({ statusCode: 400, body: { error: { message: 'Message undeliverable', code: 131026 } } });
check('marca para descartar el número', nowa.accion === 'descartar_numero', nowa.accion);

console.log('\n--- Rate limit (80007) ---');
const rl = clasificar({ statusCode: 429, body: { error: { message: 'Rate limit hit', code: 80007 } } });
check('reintenta mañana, no escala', rl.accion === 'reintentar_manana', rl.accion);

console.log('\n--- Token caducado (190) ---');
const tok = clasificar({ statusCode: 401, body: { error: { message: 'Access token has expired', code: 190 } } });
check('escala al operador', tok.accion === 'avisar_operador', tok.accion);

console.log('\n--- Fallo de red del nodo HTTP ---');
const red = clasificar({ error: { message: 'connect ETIMEDOUT 157.240.1.35:443', code: 'ETIMEDOUT' } });
check('estado error', red.estado === 'error', red.estado);
check('no inventa wamid', red.wamid === '', red.wamid);
check('error no catalogado escala', red.accion === 'avisar_operador', red.accion);

console.log('\n--- 200 pero sin wamid (respuesta rara) ---');
const raro = clasificar({ statusCode: 200, body: { messaging_product: 'whatsapp' } });
check('no lo da por enviado', raro.estado === 'error', raro.estado);
check('código sin_wamid', raro.error_code === 'sin_wamid', raro.error_code);

console.log('\n--- Forma de la fila de log ---');
const COLUMNAS = fs.readFileSync('/home/user/Channel/automatizaciones/barberia/hojas/log_mensajes.csv', 'utf8')
  .split('\n')[0].trim().split(',');
const claves = Object.keys(ok);
check('las claves coinciden con las columnas de la hoja',
  JSON.stringify(claves.slice().sort()) === JSON.stringify(COLUMNAS.slice().sort()),
  'sobran: ' + claves.filter(k => !COLUMNAS.includes(k)) + ' | faltan: ' + COLUMNAS.filter(k => !claves.includes(k)));
check('error_mensaje acotado a 300 chars', String(tpl.error_mensaje).length <= 300);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
