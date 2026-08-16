// Prueba los clasificadores del workflow 01 con respuestas reales de Twilio
// y de la WhatsApp Cloud API.
const fs = require('fs');
const vm = require('vm');

const RAIZ = __dirname + '/..';
const wf = JSON.parse(fs.readFileSync(RAIZ + '/workflows/01-reactivacion-dormidos.json', 'utf8'));
const codigo = n => wf.nodes.find(x => x.name === n).parameters.jsCode;

const ORIGEN_SMS = {
  negocio_id: 'brb001', cliente_id: 'c001', telefono: '12145550001',
  canal: 'sms', categoria: 'segmento', plantilla: 'sms_plantilla',
  encoding: 'GSM-7', segmentos: 1, costo_estimado_usd: 0.0109, dias_dormido: 58,
  aviso_encoding: '',
};
const ORIGEN_WA = {
  negocio_id: 'brb002', cliente_id: 'c101', telefono: '5215511111111',
  canal: 'whatsapp', categoria: 'marketing', plantilla: 'reactivacion_barberia_v1',
  encoding: '', segmentos: '', costo_estimado_usd: 0.0305, dias_dormido: 58,
};

function correr(nodo, respuesta, origen) {
  const ctx = vm.createContext({
    $: n => ({ item: { json: n === 'Lote de envío' ? origen : {} } }),
    $json: respuesta, JSON, Date, Number, String, Math, Object,
  });
  return vm.runInContext('(function(){' + codigo(nodo) + '})()', ctx).json;
}
const sms = r => correr('Clasificar SMS', r, ORIGEN_SMS);
const wa  = r => correr('Clasificar WhatsApp', r, ORIGEN_WA);

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

console.log('\n--- Twilio: aceptado (201) ---');
const ok = sms({ statusCode: 201, body: {
  sid: 'SMabc123', status: 'queued', to: '+12145550001', num_segments: '1', error_code: null } });
check('estado enviado', ok.estado === 'enviado', ok.estado);
check('guarda el SID', ok.wamid === 'SMabc123', ok.wamid);
check('canal sms', ok.canal === 'sms');
check('conserva encoding y segmentos', ok.encoding === 'GSM-7' && ok.segmentos === 1);
check('cobra el costo estimado', ok.costo_estimado_usd === 0.0109, String(ok.costo_estimado_usd));
check('sin accion pendiente', ok.accion === 'ninguna', ok.accion);

console.log('\n--- Twilio: 10DLC sin registrar (30034) ---');
const dlc = sms({ statusCode: 400, body: { code: 30034, message: 'US A2P 10DLC - Message from an Unregistered Number', status: 400 } });
check('estado error', dlc.estado === 'error');
check('codigo 30034', dlc.error_code === '30034', dlc.error_code);
check('diagnostico en castellano', dlc.diagnostico.includes('10DLC'), dlc.diagnostico);
check('escala al operador', dlc.accion === 'avisar_operador');
check('NO cobra un envio fallido', dlc.costo_estimado_usd === 0, String(dlc.costo_estimado_usd));

console.log('\n--- Twilio: opt-out en el operador (21610) ---');
const stop = sms({ statusCode: 400, body: { code: 21610, message: 'Attempt to send to unsubscribed recipient' } });
check('manda descartar el numero', stop.accion === 'descartar_numero', stop.accion);
check('el diagnostico dice que hay que marcarlo', /hoja/i.test(stop.diagnostico), stop.diagnostico);

console.log('\n--- Twilio: otros codigos ---');
for (const [cod, accion] of [[21614, 'descartar_numero'], [30006, 'descartar_numero'],
                             [30007, 'avisar_operador'], [20003, 'avisar_operador'],
                             [20429, 'reintentar_manana'], [30003, 'reintentar_manana']]) {
  const r = sms({ statusCode: 400, body: { code: cod, message: 'x' } });
  check(`${cod} -> ${accion}`, r.accion === accion, r.accion);
}

console.log('\n--- Twilio: casos raros ---');
const red = sms({ error: { message: 'connect ETIMEDOUT 54.172.60.0:443', code: 'ETIMEDOUT' } });
check('fallo de red da error', red.estado === 'error');
check('no inventa SID', red.wamid === '');
check('error no catalogado escala', red.accion === 'avisar_operador');
const raro = sms({ statusCode: 200, body: { status: 'queued' } });
check('201 sin SID no se da por enviado', raro.estado === 'error', raro.estado);
check('codigo sin_sid', raro.error_code === 'sin_sid', raro.error_code);

console.log('\n--- WhatsApp: sigue funcionando ---');
const wok = wa({ statusCode: 200, body: { messages: [{ id: 'wamid.HBg1' }] } });
check('estado enviado', wok.estado === 'enviado');
check('canal whatsapp', wok.canal === 'whatsapp');
check('guarda el wamid', wok.wamid === 'wamid.HBg1');
check('cobra la tarifa de marketing', wok.costo_estimado_usd === 0.0305, String(wok.costo_estimado_usd));
const tpl = wa({ statusCode: 400, body: { error: { code: 132001, message: 'Template does not exist' } } });
check('132001 escala al operador', tpl.accion === 'avisar_operador');
check('132001 no se cobra', tpl.costo_estimado_usd === 0);
const nowa = wa({ statusCode: 400, body: { error: { code: 131026, message: 'Message undeliverable' } } });
check('131026 descarta el numero', nowa.accion === 'descartar_numero');

console.log('\n--- Forma de la fila de log ---');
const COLS = fs.readFileSync(RAIZ + '/hojas/log_mensajes.csv', 'utf8').split('\n')[0].trim().split(',');
for (const [nombre, fila] of [['SMS', ok], ['WhatsApp', wok]]) {
  const claves = Object.keys(fila);
  check(`${nombre}: las claves coinciden con las columnas`,
    JSON.stringify(claves.slice().sort()) === JSON.stringify(COLS.slice().sort()),
    'sobran: ' + claves.filter(k => !COLS.includes(k)) + ' | faltan: ' + COLS.filter(k => !claves.includes(k)));
}
check('error_mensaje acotado a 300 chars', String(dlc.error_mensaje).length <= 300);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
