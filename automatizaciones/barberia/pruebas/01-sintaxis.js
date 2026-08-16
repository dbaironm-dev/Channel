// Valida sintácticamente el jsCode de cada nodo Code y las expresiones ={{ }}.
const fs = require('fs');
const vm = require('vm');

const DIR = __dirname + '/../workflows';
const archivos = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort().map(f => DIR + '/' + f);

let fallos = 0;
for (const file of archivos) {
  const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = file.split('/').pop();
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.code') {
      const code = node.parameters.jsCode;
      try {
        // Envuelto en función: el código de n8n usa return de nivel superior.
        new vm.Script('(function(){' + code + '})');
        console.log(`  ok   ${base} :: ${node.name} (${code.split('\n').length} líneas)`);
      } catch (e) {
        console.log(`  FAIL ${base} :: ${node.name} -> ${e.message}`);
        fallos++;
      }
    }
    // Expresiones de n8n: comprueba que el interior de ={{ }} parsea como JS.
    const walk = (v, path) => {
      if (typeof v === 'string' && v.startsWith('=')) {
        const m = v.matchAll(/\{\{([\s\S]*?)\}\}/g);
        for (const [, expr] of m) {
          try { new vm.Script('(' + expr + ')'); }
          catch (e) { console.log(`  FAIL ${base} :: ${node.name} ${path} expr -> ${e.message}`); fallos++; }
        }
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, path + '.' + k);
      }
    };
    walk(node.parameters, '');
  }
}
console.log(fallos ? `\n${fallos} fallo(s)` : '\nSintaxis OK');
process.exit(fallos ? 1 : 0);
