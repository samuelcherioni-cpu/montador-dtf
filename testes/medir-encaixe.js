// Mede o encaixe em muitos cenários sorteados, em paralelo.
//   node testes/medir-encaixe.js [--n 1000] [--ms 500] [--semente 1] [--saida arquivo.json] [--encaixe caminho.js]
// Mostra o aproveitamento médio por tipo de fila, os piores casos e qualquer erro (sobreposição etc.).
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs');

if (!isMainThread) {
  const { gerarCenarios, avaliar } = require('./cenarios.js');
  const Encaixe = require(workerData.encaixe);
  const cenarios = gerarCenarios(workerData.n, workerData.semente);
  const saida = [];
  for (let i = workerData.inicio; i < cenarios.length; i += workerData.passo) saida.push(avaliar(Encaixe, cenarios[i], { limiteMs: workerData.ms }));
  parentPort.postMessage(saida);
  return;
}

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : padrao; };
const n = Number(arg('n', 1000)), ms = Number(arg('ms', 500)), semente = Number(arg('semente', 1));
const encaixe = path.resolve(arg('encaixe', path.join(__dirname, '..', 'site', 'encaixe.js')));
const saidaArq = arg('saida', null);
const passo = Math.max(1, Math.min(os.cpus().length - 2, 10));

const inicio = Date.now();
Promise.all(Array.from({ length: passo }, (_, k) => new Promise((ok, falha) => {
  const w = new Worker(__filename, { workerData: { n, ms, semente, encaixe, inicio: k, passo } });
  w.once('message', ok);
  w.once('error', falha);
}))).then((partes) => {
  const res = partes.flat().sort((a, b) => a.id - b.id);
  const porTipo = {};
  for (const r of res) (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r);
  const media = (l, f) => l.reduce((s, x) => s + f(x), 0) / l.length;
  console.log(`${res.length} cenários, ${(media(res, (r) => r.pecas)).toFixed(0)} peças em média, ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  console.log('tipo de fila                aproveit.  folga   pior folga');
  for (const [tipo, l] of Object.entries(porTipo)) {
    console.log(`${tipo.padEnd(26)} ${(media(l, (r) => r.aproveitamento) * 100).toFixed(1).padStart(6)}%  ${media(l, (r) => r.folga).toFixed(3)}  ${Math.max(...l.map((r) => r.folga)).toFixed(3)}`);
  }
  console.log(`${'TODOS'.padEnd(26)} ${(media(res, (r) => r.aproveitamento) * 100).toFixed(1).padStart(6)}%  ${media(res, (r) => r.folga).toFixed(3)}`);
  const erros = res.filter((r) => r.erro || r.fora);
  console.log(`erros: ${erros.length}` + (erros.length ? ' -> ' + erros.slice(0, 5).map((r) => `#${r.id} ${r.erro || r.fora + ' de fora'}`).join('; ') : ''));
  const piores = [...res].sort((a, b) => b.folga - a.folga).slice(0, 8);
  console.log('piores: ' + piores.map((r) => `#${r.id} ${r.tipo} ${r.folga.toFixed(2)}`).join(' | '));
  console.log(`tempo por fila: médio ${media(res, (r) => r.ms).toFixed(0)} ms, máximo ${Math.max(...res.map((r) => r.ms))} ms`);
  if (saidaArq) fs.writeFileSync(saidaArq, JSON.stringify(res));
  if (erros.some((r) => r.erro)) process.exitCode = 1;
});
