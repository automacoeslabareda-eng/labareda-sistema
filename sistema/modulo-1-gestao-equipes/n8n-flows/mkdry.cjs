/* Gera versao dry-run do avisar-colaboradores.js.
 *
 * Regra desta ferramenta: ela NAO pode mandar WhatsApp, nem por acidente.
 * A versao anterior dependia de casar uma regex com o bloco de envio; quando
 * o codigo foi refatorado para `enviarWhats()`, a regex deixou de bater e o
 * "dry-run" enviou 8 mensagens reais. Agora o bloqueio nao depende de regex:
 * o proprio transporte HTTP recusa qualquer escrita.
 */
const fs = require('fs');
const [, , entrada, saida] = process.argv;
let src = fs.readFileSync(entrada, 'utf8');

// transporte de teste: GET no Supabase passa; POST/PATCH/DELETE e envio, nao.
const STUB = `
const http = async (o) => {
  const metodo = (o.method || 'GET').toUpperCase();
  if (o.url === ENVIO_WEBHOOK) {
    __enviosSimulados.push({ telefone: o.body.telefone, mensagem: o.body.mensagem });
    return { statusCode: 200, __simulado: true };
  }
  if (metodo !== 'GET') {
    __escritasBloqueadas.push(metodo + ' ' + o.url.split('?')[0]);
    return o.url.includes('checklist_items') ? [{ id: 'DRY', tarefa_id: 'DRY' }] : [];
  }
  const r = await fetch(o.url, { headers: o.headers });
  if (!r.ok) throw new Error('GET ' + o.url + ' -> ' + r.status);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};
const __enviosSimulados = [];
const __escritasBloqueadas = [];
`;

if (!src.includes('const http = this.helpers.httpRequest;')) {
  throw new Error('nao encontrei o helper HTTP para substituir — revise o mkdry');
}
src = src.replace('const http = this.helpers.httpRequest;', STUB);

src = src.replace(/const entrada = .*;/, 'const entrada = { modo: process.argv[2] || "resumo" };');

// permite inspecionar o texto de sexta em qualquer dia: mkdry ... --sexta
if (process.argv.includes('--sexta')) {
  src = src.replace(
    /const ehSexta = .*;/,
    'const ehSexta = true; // forcado para inspecao'
  );
}

src = src.replace(
  /^return \[\{[\s\S]*$/m,
  `
__enviosSimulados.forEach((e) => {
  console.log('--- PARA ' + e.telefone + ' ---');
  console.log(e.mensagem);
  console.log();
});
console.log('== DRY-RUN, nada saiu de verdade ==');
console.log('mensagens que sairiam:', __enviosSimulados.length);
console.log('escritas bloqueadas  :', __escritasBloqueadas.length, __escritasBloqueadas.slice(0, 4));
`
);

fs.writeFileSync(saida, '(async () => {\n' + src + '\n})()');
console.log('gerado:', saida, process.argv.includes('--sexta') ? '(modo sexta forcado)' : '');
