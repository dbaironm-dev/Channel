// Prueba el workflow 02 con sobres reales de Twilio y de la WhatsApp Cloud API.
const fs = require('fs');
const vm = require('vm');

const RAIZ = __dirname + '/..';
const wf = JSON.parse(fs.readFileSync(RAIZ + '/workflows/02-respuestas-entrantes.json', 'utf8'));
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
const BASE = { JSON, Date, Number, String, Math, Object, Array, Set, isNaN, RegExp, encodeURIComponent };

const normalizar = sobre => vm.runInContext('(function(){' + codigo('Normalizar evento') + '})()',
  vm.createContext({ ...BASE, $input: { all: () => [{ json: sobre }] }, console: { log() {} } })).map(i => i.json);

const interpretar = ev => vm.runInContext('(function(){' + codigo('Interpretar respuesta') + '})()',
  vm.createContext({ ...BASE, $json: ev, console: { log() {} },
    $: n => ({ all: () => (n === 'Leer negocios' ? NEGOCIOS : CLIENTES).map(json => ({ json })) }) })).json;

const acuse = ev => vm.runInContext('(function(){' + codigo('Interpretar acuse') + '})()',
  vm.createContext({ ...BASE, $json: ev, console: { log() {} } })).json;

// --- Sobres reales ----------------------------------------------------------
const twSms = (body, from = '+12145550001') => ({
  MessageSid: 'SM1111', SmsSid: 'SM1111', AccountSid: 'AC000',
  MessagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  From: from, To: '+12145559000', Body: body, NumMedia: '0', FromState: 'TX',
});
const twEstado = (status, extra = {}) => ({
  MessageSid: 'SM2222', SmsSid: 'SM2222', MessageStatus: status, SmsStatus: status,
  To: '+12145550001', ...extra,
});
const waSobre = v => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: v }] }] });
const waMeta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '5215512345678', phone_number_id: '123456789012345' } };
const waMsg = (m, waId = '525511111111') => waSobre({
  ...waMeta, contacts: [{ profile: { name: 'Carlos Mendez' }, wa_id: waId }],
  messages: [{ from: waId, id: 'wamid.IN1', timestamp: '1755350000', ...m }],
});

// GSM-7: lo que NO esté aquí fuerza UCS-2 y multiplica el costo del SMS.
const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡'
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€';
const esGsm7 = t => [...String(t)].every(c => GSM7.includes(c));

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

console.log('\n--- Normalización: Twilio ---');
const evSms = normalizar(twSms('YES'));
check('un evento', evSms.length === 1);
check('clase mensaje', evSms[0].clase === 'mensaje');
check('canal sms', evSms[0].canal === 'sms');
check('extrae el texto', evSms[0].texto === 'YES');
check('extrae el remitente', evSms[0].from === '+12145550001');
check('guarda el numero del negocio', evSms[0].remitente_negocio === '+12145559000');
check('guarda el Messaging Service', evSms[0].remitente_servicio.startsWith('MG'));
check('SMS no tiene payload de boton', evSms[0].payload_boton === '');

const evEst = normalizar(twEstado('delivered'));
check('el callback de estado se detecta como acuse', evEst[0].clase === 'estado', evEst[0].clase);
check('no lo confunde con un mensaje', evEst[0].estado_entrega === 'delivered');

console.log('\n--- Normalización: Meta (sigue funcionando) ---');
const evWa = normalizar(waMsg({ type: 'button', button: { payload: 'AGENDAR', text: 'Si' } }));
check('canal whatsapp', evWa[0].canal === 'whatsapp');
check('extrae el payload del boton', evWa[0].payload_boton === 'AGENDAR');
const mixto = normalizar(waSobre({ ...waMeta,
  contacts: [{ profile: { name: 'A' }, wa_id: '525511111111' }],
  messages: [{ from: '525511111111', id: 'wamid.A', type: 'text', text: { body: 'hola' } }],
  statuses: [{ id: 'wamid.B', status: 'delivered', pricing: { billable: true, category: 'marketing' } }] }));
check('separa mensajes y acuses del mismo POST', mixto.length === 2);
check('sobre vacio no revienta', normalizar({ object: 'x' }).length === 0);

console.log('\n--- Numeros de EE.UU. con y sin el 1 ---');
// La hoja guarda 12145550001; el operador puede devolver 2145550001.
const sinUno = interpretar(normalizar(twSms('YES', '+12145550001'))[0]);
check('identifica con el 1', sinUno.cliente_id === 'c001', sinUno.cliente_id);
const conDiez = interpretar(normalizar(twSms('YES', '2145550001'))[0]);
check('identifica sin el 1', conDiez.cliente_id === 'c001', conDiez.cliente_id);
const mx = interpretar(normalizar(waMsg({ type: 'text', text: { body: 'si' } }, '525511111111'))[0]);
check('sigue resolviendo el 52/521 de Mexico', mx.cliente_id === 'c101', mx.cliente_id);

console.log('\n--- Opt-out: lo que Twilio NO intercepta ---');
// Twilio se queda con STOP, END, QUIT, CANCEL y UNSUBSCRIBE. El resto llega
// aquí, y desde abril de 2025 hay que honrarlo igual.
const intencionSms = t => interpretar(normalizar(twSms(t))[0]).intencion;
for (const frase of ['please take me off your list', 'stop texting me', 'do not text me again',
                     'ya no me manden mensajes', 'quitame de la lista', 'leave me alone']) {
  check(`"${frase}" -> baja`, intencionSms(frase) === 'baja', intencionSms(frase));
}

console.log('\n--- Intenciones ---');
for (const [t, esperada] of [['YES', 'agendar'], ['yes please', 'agendar'], ['Si', 'agendar'],
                             ['sounds good', 'agendar'], ['not now', 'ahora_no'], ['no thanks', 'ahora_no'],
                             ['how much for a fade?', 'otro'], ['what time do you open', 'otro']]) {
  check(`"${t}" -> ${esperada}`, intencionSms(t) === esperada, intencionSms(t));
}

console.log('\n--- Respuesta por SMS ---');
const ag = interpretar(normalizar(twSms('YES'))[0]);
check('marca canal sms', ag.es_sms === true);
check('arma formulario, no payload', ag.respuesta_form.length > 0 && ag.respuesta_payload === null);
check('responde al cliente correcto', ag.respuesta_form.includes('To=%2B12145550001'));
check('usa el Messaging Service', ag.respuesta_form.includes('MessagingServiceSid=MG'));

const cuerpo = decodeURIComponent((ag.respuesta_form.match(/Body=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ');
console.log('  respuesta: "' + cuerpo + '"');
check('la respuesta cabe en GSM-7 (no triplica el costo)', esGsm7(cuerpo), cuerpo);
for (const i of ['baja', 'ahora_no', 'otro']) {
  const r = interpretar(normalizar(twSms({ baja: 'take me off', ahora_no: 'not now', otro: 'que precio?' }[i]))[0]);
  const b = decodeURIComponent((r.respuesta_form.match(/Body=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ');
  check(`respuesta de "${i}" en GSM-7`, esGsm7(b), b);
}

console.log('\n--- Aviso al dueño ---');
check('agendar avisa al dueño', ag.avisar_dueno === true);
check('el aviso va al dueño', ag.aviso_form.includes('To=%2B12145551234'), ag.aviso_form.slice(0, 40));
const avisoCuerpo = decodeURIComponent((ag.aviso_form.match(/Body=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ');
console.log('  aviso: "' + avisoCuerpo + '"');
check('el aviso lleva el telefono del cliente', avisoCuerpo.includes('12145550001'));
check('el aviso lleva el nombre', avisoCuerpo.includes('Juan Perez'));
check('el aviso no deja marcadores', !/\{[a-z_]+\}/.test(avisoCuerpo), avisoCuerpo);
check('el aviso cabe en GSM-7', esGsm7(avisoCuerpo));

const bajaSms = interpretar(normalizar(twSms('take me off your list'))[0]);
check('baja marca optout=si', bajaSms.nuevo_optout === 'si');
check('baja NO molesta al dueño', bajaSms.avisar_dueno === false);
const noSms = interpretar(normalizar(twSms('not now'))[0]);
check('ahora_no NO molesta al dueño', noSms.avisar_dueno === false);

console.log('\n--- WhatsApp sigue intacto ---');
const waAg = interpretar(normalizar(waMsg({ type: 'button', button: { payload: 'AGENDAR', text: 'Si' } }))[0]);
check('canal whatsapp', waAg.es_sms === false);
check('arma payload, no formulario', waAg.respuesta_payload?.type === 'text' && waAg.respuesta_form === '');
check('aviso por plantilla utility', waAg.aviso_payload?.template?.name === 'aviso_cliente_interesado_v1');
check('responder en ventana de 24h es gratis', waAg.fila_log.costo_estimado_usd === 0);
check('el SMS entrante SI se cobra', ag.fila_log.costo_estimado_usd === 0.0079, String(ag.fila_log.costo_estimado_usd));

console.log('\n--- Numero desconocido ---');
const desc = interpretar(normalizar(twSms('hello', '+19995551111'))[0]);
check('no revienta', !!desc);
check('marca que no lo identifico', desc.encontrado === false);
check('no intenta actualizar una ficha inexistente', desc.actualizar_cliente === false);
check('resuelve el negocio por el numero remitente', desc.negocio_id === '' && desc.aviso_form !== '');
check('escala al operador', desc.fila_log.accion === 'avisar_operador');

console.log('\n--- Acuses de entrega ---');
const ent = acuse(normalizar(twEstado('delivered'))[0]);
check('delivered -> entregado', ent.estado === 'entregado', ent.estado);
check('lo marca facturable', ent.facturable === 'si', ent.facturable);
const undel = acuse(normalizar(twEstado('undelivered', { ErrorCode: '30007', ErrorMessage: 'Message filtered' }))[0]);
check('undelivered -> no_entregado', undel.estado === 'no_entregado', undel.estado);
check('escala al operador', undel.accion === 'avisar_operador');
check('guarda el motivo', undel.error_mensaje.includes('30007'), undel.error_mensaje);
const waEnt = acuse(normalizar(waSobre({ ...waMeta, statuses: [{ id: 'wamid.B', status: 'delivered',
  pricing: { billable: true, category: 'marketing' } }] }))[0]);
check('Meta sigue reportando categoria real', waEnt.categoria === 'marketing', waEnt.categoria);

console.log('\n--- Forma de la fila de log ---');
const COLS = fs.readFileSync(RAIZ + '/hojas/log_mensajes.csv', 'utf8').split('\n')[0].trim().split(',');
const claves = Object.keys(ag.fila_log);
check('coincide con las columnas de la hoja',
  JSON.stringify(claves.slice().sort()) === JSON.stringify(COLS.slice().sort()),
  'sobran: ' + claves.filter(k => !COLS.includes(k)) + ' | faltan: ' + COLS.filter(k => !claves.includes(k)));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodas las comprobaciones pasan');
process.exit(fallos ? 1 : 0);
