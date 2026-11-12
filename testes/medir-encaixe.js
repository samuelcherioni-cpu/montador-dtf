// Mede o encaixe em muitos cenários sorteados, em paralelo.
//   node testes/medir-encaixe.js [--n 1000] [--ms 500] [--semente 1] [--saida arquivo.json] [--encaixe caminho.js]
// Mostra o aproveitamento médio por tipo de fila, os piores casos e qualquer erro (sobreposição etc.).
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs');

if (!isMainThread) {
  const { gerarCenario, avaliar } = require('./cenarios.js');
  const Encaixe = require(workerData.encaixe);
  const saida = [];
  // --ms auto: o mesmo tempo que a tela dá ao trabalhador (de 4 a 12 s, conforme o número de peças)
  const tempo = (c) => { if (workerData.ms !== 'auto') return Number(workerData.ms); const n = c.artes.reduce((s, a) => s + a.qtd, 0); return Math.min(12000, Math.max(4000, 3000 + n * 60)); };
  for (let i = workerData.inicio; i < workerData.n; i += workerData.passo) {
    const c = gerarCenario(i, workerData.semente, workerData.conjunto); // gera, mede e descarta: memória baixa
    const r = avaliar(Encaixe, c, { limiteMs: tempo(c) });
    saida.push(r);
    parentPort.postMessage({ parcial: r }); // andamento
  }
  parentPort.postMessage({ fim: saida });
  return;
}

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : padrao; };
const n = Number(arg('n', 1000)), ms = arg('ms', '500'), semente = Number(arg('semente', 1));
const encaixe = path.resolve(arg('encaixe', path.join(__dirname, '..', 'site', 'encaixe.js')));
const saidaArq = arg('saida', null);
const conjunto = arg('conjunto', 'geral');
// --nucleos: quantos núcleos usar (padrão: metade dos que existem, para o computador continuar usável)
const passo = Math.max(1, Number(arg('nucleos', Math.floor(os.cpus().length / 2))));

const inicio = Date.now();
const feitos = [];
Promise.all(Array.from({ length: passo }, (_, k) => new Promise((ok, falha) => {
  const w = new Worker(__filename, { workerData: { n, ms, semente, encaixe, inicio: k, passo, conjunto } });
  w.on('message', (msg) => {
    if (msg.fim) return ok(msg.fim);
    feitos.push(msg.parcial);
    if (feitos.length % 100 === 0 || feitos.length === n) {
      const ap = feitos.reduce((s, r) => s + r.aproveitamento, 0) / feitos.length;
      const ult = feitos.filter((r) => r.aumentou !== null), ok2 = ult.filter((r) => r.aumentou === 0).length;
      console.log(`  andamento: ${feitos.length} de ${n} filas · aproveitamento médio até aqui ${(ap * 100).toFixed(1)}%` +
        (ult.length ? ` · pequena por último sem aumentar a folha: ${ok2} de ${ult.length}` : '') +
        ` · erros: ${feitos.filter((r) => r.erro || r.fora).length} · ${((Date.now() - inicio) / 60000).toFixed(1)} min`);
    }
  });
  w.once('error', falha);
}))).then((partes) => {
  const res = partes.flat().sort((a, b) => a.id - b.id);
  const porTipo = {};
  for (const r of res) (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r);
  const media = (l, f) => l.reduce((s, x) => s + f(x), 0) / l.length;
  console.log(`[${conjunto}] ${res.length} cenários, ${(media(res, (r) => r.pecas)).toFixed(0)} peças em média, ${((Date.now() - inicio) / 1000).toFixed(0)} s`);
  console.log('tipo de fila                aproveit.  folga   pior folga');
  for (const [tipo, l] of Object.entries(porTipo)) {
    console.log(`${tipo.padEnd(26)} ${(media(l, (r) => r.aproveitamento) * 100).toFixed(1).padStart(6)}%  ${media(l, (r) => r.folga).toFixed(3)}  ${Math.max(...l.map((r) => r.folga)).toFixed(3)}`);
  }
  console.log(`${'TODOS'.padEnd(26)} ${(media(res, (r) => r.aproveitamento) * 100).toFixed(1).padStart(6)}%  ${media(res, (r) => r.folga).toFixed(3)}`);
  const ultimas = res.filter((r) => r.aumentou !== null);
  if (ultimas.length) {
    const cresceu = ultimas.filter((r) => r.aumentou > 0);
    console.log(`pequena por último: em ${ultimas.length - cresceu.length} de ${ultimas.length} filas ela coube num buraco sem aumentar a folha` +
      (cresceu.length ? `; nas outras a folha cresceu em média ${(media(cresceu, (r) => r.aumentou) / 10).toFixed(1)} cm (pior ${(Math.max(...cresceu.map((r) => r.aumentou)) / 10).toFixed(1)} cm)` : ''));
  }
  const erros = res.filter((r) => r.erro || r.fora);
  console.log(`erros: ${erros.length}` + (erros.length ? ' -> ' + erros.slice(0, 5).map((r) => `#${r.id} ${r.erro || r.fora + ' de fora'}`).join('; ') : ''));
  const piores = [...res].sort((a, b) => b.folga - a.folga).slice(0, 8);
  console.log('piores: ' + piores.map((r) => `#${r.id} ${r.tipo} ${r.folga.toFixed(2)}`).join(' | '));
  console.log(`tempo por fila: médio ${media(res, (r) => r.ms).toFixed(0)} ms, máximo ${Math.max(...res.map((r) => r.ms))} ms`);
  if (saidaArq) fs.writeFileSync(saidaArq, JSON.stringify(res));
  if (erros.some((r) => r.erro)) process.exitCode = 1;
});
