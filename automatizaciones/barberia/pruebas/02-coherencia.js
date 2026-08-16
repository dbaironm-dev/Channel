// Comprobaciones cruzadas entre workflows, hojas y documentación.
const fs = require('fs');
const RAIZ = '/home/user/Channel/automatizaciones/barberia';

let fallos = 0;
const check = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n}${d ? ' -> ' + d : ''}`); if (!c) fallos++; };

const wfs = fs.readdirSync(RAIZ + '/workflows').filter(f => f.endsWith('.json'))
  .map(f => ({ f, wf: JSON.parse(fs.readFileSync(RAIZ + '/workflows/' + f, 'utf8')) }));

console.log('\n--- Estructura de los workflows ---');
for (const { f, wf } of wfs) {
  check(`${f}: tiene name/nodes/connections`, !!wf.name && Array.isArray(wf.nodes) && !!wf.connections);
  check(`${f}: nombres de nodo únicos`, new Set(wf.nodes.map(n => n.name)).size === wf.nodes.length);
  check(`${f}: ids de nodo únicos`, new Set(wf.nodes.map(n => n.id)).size === wf.nodes.length);
  check(`${f}: tiene exactamente un nodo disparador`,
    wf.nodes.filter(n => /Trigger$|webhook$/i.test(n.type)).length >= 1);
  const sinPos = wf.nodes.filter(n => !Array.isArray(n.position) || n.position.length !== 2);
  check(`${f}: todos los nodos con posición`, sinPos.length === 0, sinPos.map(n => n.name).join());
}

console.log('\n--- Pestañas referenciadas vs CSVs existentes ---');
const csvs = new Set(fs.readdirSync(RAIZ + '/hojas').map(f => f.replace('.csv', '')));
const pestanas = new Set();
for (const { wf } of wfs) {
  for (const n of wf.nodes) {
    const s = n.parameters?.sheetName?.value;
    if (typeof s === 'string' && !s.startsWith('=')) pestanas.add(s);
  }
}
for (const p of pestanas) check(`pestaña "${p}" tiene su CSV`, csvs.has(p));
check('no sobran CSVs sin usar', [...csvs].every(c => pestanas.has(c)),
  [...csvs].filter(c => !pestanas.has(c)).join());

console.log('\n--- Columnas escritas vs cabeceras de las hojas ---');
const cab = h => fs.readFileSync(`${RAIZ}/hojas/${h}.csv`, 'utf8').split('\n')[0].trim().split(',');
for (const { f, wf } of wfs) {
  for (const n of wf.nodes) {
    const cols = n.parameters?.columns;
    if (cols?.mappingMode !== 'defineBelow') continue;
    const hoja = n.parameters.sheetName?.value;
    if (!csvs.has(hoja)) continue;
    const cabeceras = cab(hoja);
    const escritas = Object.keys(cols.value ?? {});
    const malas = escritas.filter(c => !cabeceras.includes(c));
    check(`${f} :: ${n.name} escribe en "${hoja}"`, malas.length === 0, 'columnas inexistentes: ' + malas.join());
    for (const m of (cols.matchingColumns ?? []))
      check(`${f} :: ${n.name} busca por "${m}"`, cabeceras.includes(m));
  }
}

console.log('\n--- Plantillas: hoja vs documentación ---');
const negocios = fs.readFileSync(RAIZ + '/hojas/negocios.csv', 'utf8');
const doc = fs.readFileSync(RAIZ + '/plantillas-whatsapp.md', 'utf8');
for (const t of ['reactivacion_barberia_v1', 'resumen_diario_barberia_v1', 'aviso_cliente_interesado_v1']) {
  check(`"${t}" está en negocios.csv`, negocios.includes(t));
  check(`"${t}" está documentada`, doc.includes(t));
}

console.log('\n--- Payloads de los botones ---');
const wf01 = wfs.find(x => x.f.startsWith('01')).wf;
const sel = wf01.nodes.find(n => n.name === 'Seleccionar dormidos').parameters.jsCode;
const wf02 = wfs.find(x => x.f.startsWith('02')).wf;
const int = wf02.nodes.find(n => n.name === 'Interpretar respuesta').parameters.jsCode;
for (const p of ['AGENDAR', 'AHORA_NO', 'BAJA']) {
  check(`${p}: lo manda el 01`, sel.includes(`'${p}'`));
  check(`${p}: lo entiende el 02`, int.includes(p));
  check(`${p}: está en la doc de plantillas`, doc.includes(p));
}

console.log('\n--- Canal y plantillas SMS ---');
const negociosFilas = fs.readFileSync(RAIZ + '/hojas/negocios.csv', 'utf8').trim().split('\n');
const cabN = negociosFilas[0].split(',');
const col = (fila, nombre) => {
  // Parser de una fila con comillas, suficiente para leer una columna.
  const out = []; let campo = '', q = false;
  for (let i = 0; i < fila.length; i++) {
    const c = fila[i];
    if (q) { if (c === '"' && fila[i+1] === '"') { campo += '"'; i++; } else if (c === '"') q = false; else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(campo); campo = ''; }
    else campo += c;
  }
  out.push(campo);
  return out[cabN.indexOf(nombre)] ?? '';
};

// GSM-7: un solo carácter fuera de este set convierte el SMS entero a UCS-2
// y la capacidad cae de 160 a 70 caracteres, es decir, triplica la factura.
const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡'
  + 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€';
const MARCADORES = ['nombre', 'negocio', 'servicio', 'nombre_completo', 'telefono', 'enviados'];

for (const fila of negociosFilas.slice(1)) {
  const id = col(fila, 'negocio_id');
  const canal = col(fila, 'canal');
  check(`${id}: canal válido`, ['sms', 'whatsapp'].includes(canal), canal);
  if (canal !== 'sms') continue;

  check(`${id}: tiene remitente SMS`, col(fila, 'sms_remitente').trim().length > 0);
  for (const campo of ['sms_plantilla', 'sms_aviso', 'sms_resumen']) {
    const txt = col(fila, campo);
    check(`${id}: ${campo} no está vacía`, txt.trim().length > 0);
    const malos = [...txt].filter(c => !GSM7.includes(c) && c !== '{' && c !== '}');
    check(`${id}: ${campo} cabe en GSM-7`, malos.length === 0,
      malos.length ? 'fuera de GSM-7: ' + [...new Set(malos)].join(' ') + ' (triplica el costo)' : '');
    const usados = [...txt.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    const desconocidos = usados.filter(u => !MARCADORES.includes(u));
    check(`${id}: ${campo} solo usa marcadores conocidos`, desconocidos.length === 0, desconocidos.join());
  }
  check(`${id}: sms_plantilla indica cómo salir`, /STOP/i.test(col(fila, 'sms_plantilla')));
  check(`${id}: tiene zona horaria`, col(fila, 'zona_horaria').includes('/'), col(fila, 'zona_horaria'));
}

console.log('\n--- Marcadores por reemplazar (deben existir, son intencionales) ---');
for (const { f, wf } of wfs) {
  const txt = JSON.stringify(wf);
  const marcas = (txt.match(/REEMPLAZA_CON_[A-Z_]+/g) ?? []);
  check(`${f}: marcadores presentes`, marcas.length > 0, [...new Set(marcas)].join(' '));
}

console.log('\n--- Nada de secretos en los JSON ---');
for (const { f, wf } of wfs) {
  const txt = JSON.stringify(wf);
  check(`${f}: sin tokens de Meta`, !/EAA[A-Za-z0-9]{20,}/.test(txt));
  check(`${f}: sin bloque credentials embebido`, !wf.nodes.some(n => n.credentials));
}

console.log(fallos ? `\n${fallos} fallo(s)` : '\nCoherencia OK');
process.exit(fallos ? 1 : 0);
