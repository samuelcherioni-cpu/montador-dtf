// node testes/teste-encaixe.js — confere o encaixe: nada sobreposto, tudo dentro da largura, espaço mínimo e cópias certas.
'use strict';
const assert = require('assert');
const { encaixar, sobrepoe, perfilRetangulo } = require('../site/encaixe.js');

const LARG = 564; // 57 cm menos 3 mm de cada lado
let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log('ok   ' + nome); } catch (e) { falhas++; console.log('FALHA ' + nome + '\n      ' + e.message); }
}

function conferir(novas, r, espaco, fixas = []) {
  const caixas = fixas.map((f) => ({ ...f }));
  for (const n of novas) {
    const p = r.pos[n.id];
    if (!p) continue;
    const w = p.rot ? n.h : n.w, h = p.rot ? n.w : n.h;
    assert(p.x >= -1e-6 && p.y >= -1e-6, `${n.id} fora pelo começo`);
    assert(p.x + w <= LARG + 1e-6, `${n.id} passa da largura (${p.x + w})`);
    caixas.push({ id: n.id, x: p.x, y: p.y, w, h });
  }
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i], b = caixas[j];
      const separadas = a.x + a.w + espaco <= b.x + 1e-6 || b.x + b.w + espaco <= a.x + 1e-6 ||
        a.y + a.h + espaco <= b.y + 1e-6 || b.y + b.h + espaco <= a.y + 1e-6;
      assert(separadas, `${a.id || 'fixa'} e ${b.id || 'fixa'} sem o espaço mínimo`);
    }
  }
  return caixas;
}

let semente = 7;
const sorteio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);

caso('uma arte vai para o canto', () => {
  const novas = [{ id: 'a', w: 150, h: 214, rot: 0 }];
  const r = encaixar({ largura: LARG, espaco: 5, girar: false, novas });
  assert.deepStrictEqual(r.pos.a, { x: 0, y: 0, rot: 0 });
  assert.strictEqual(r.fundo, 214);
  const g = encaixar({ largura: LARG, espaco: 5, girar: true, novas });
  assert.strictEqual(g.fundo, 150); // girada gasta menos filme
});

caso('três de 150 mm cabem lado a lado', () => {
  const novas = ['a', 'b', 'c'].map((id) => ({ id, w: 150, h: 214, rot: 0 }));
  const r = encaixar({ largura: LARG, espaco: 5, girar: false, novas });
  conferir(novas, r, 5);
  assert.strictEqual(r.fundo, 214);
});

caso('200 artes sorteadas: sem sobreposição e com espaço', () => {
  const novas = [];
  for (let i = 0; i < 200; i++) novas.push({ id: 'p' + i, w: 20 + sorteio() * 250, h: 20 + sorteio() * 250, rot: 0 });
  const r = encaixar({ largura: LARG, espaco: 5, novas });
  assert.strictEqual(r.fora.length, 0);
  assert.strictEqual(Object.keys(r.pos).length, 200);
  conferir(novas, r, 5);
  const areaArtes = novas.reduce((s, n) => s + (n.w + 5) * (n.h + 5), 0);
  const aproveitamento = areaArtes / ((LARG + 5) * r.fundo);
  console.log('      aproveitamento ' + (aproveitamento * 100).toFixed(1) + '% em ' + (r.fundo / 1000).toFixed(2) + ' m');
  assert(aproveitamento > 0.7, 'aproveitamento baixo');
});

caso('arte larga demais só entra girada', () => {
  const novas = [{ id: 'a', w: 600, h: 100, rot: 0 }];
  const r1 = encaixar({ largura: LARG, espaco: 5, girar: false, novas });
  assert.deepStrictEqual(r1.fora, ['a']);
  const r2 = encaixar({ largura: LARG, espaco: 5, girar: true, novas });
  assert.strictEqual(r2.pos.a.rot, 90);
  conferir(novas, r2, 5);
});

// perfil de uma arte em "L": caixa cheia, menos um canto vazio (transparente) em cima à esquerda
function perfilL(cols, linhas, vazioCols, vazioLinhas) {
  const p = perfilRetangulo(cols, linhas);
  for (let i = 0; i < vazioLinhas; i++) p.L[i] = vazioCols;
  return p;
}
function girarPerfil(p) { // 90° no sentido horário, como na tela
  const q = perfilRetangulo(p.linhas, p.cols);
  for (let i = 0; i < q.linhas; i++) {
    let l = 32767, r = -1;
    for (let j = 0; j < p.linhas; j++) if (i >= p.L[j] && i < p.R[j]) { const x = p.linhas - 1 - j; if (x < l) l = x; if (x + 1 > r) r = x + 1; }
    q.L[i] = r > l ? l : 0; q.R[i] = r > l ? r : 0;
  }
  return q;
}

caso('arte pequena entra no vão transparente de uma grande', () => {
  const grande = perfilL(300, 250, 150, 120); // canto vazio de 15 × 12 cm
  const novas = [
    { id: 'G', w: 300, h: 250, rot: 0, fixo: true, perfis: { 0: grande, 90: girarPerfil(grande) } },
    { id: 'P', w: 60, h: 60, rot: 0 },
  ];
  const r = encaixar({ largura: LARG, espaco: 5, novas });
  assert.deepStrictEqual(r.pos.G, { x: 0, y: 0, rot: 0 });
  assert(r.pos.P.y + 60 <= 120 - 5 && r.pos.P.x + 60 <= 150 - 5 || r.pos.P.x >= 305,
    'a pequena devia ficar no vão ou ao lado: ' + JSON.stringify(r.pos.P));
  assert.strictEqual(r.fundo, 250);
});

caso('várias pequenas preenchem o vão antes de descer o filme', () => {
  const grande = perfilL(560, 300, 400, 150); // ocupa quase toda a largura, vão de 40 × 15 cm
  const novas = [{ id: 'G', w: 560, h: 300, rot: 0, fixo: true, perfis: { 0: grande, 90: girarPerfil(grande) } }];
  for (let i = 0; i < 12; i++) novas.push({ id: 'p' + i, w: 80, h: 60, rot: 0, fixo: true });
  const r = encaixar({ largura: LARG, espaco: 5, novas });
  const noVao = Object.keys(r.pos).filter((id) => id !== 'G' && r.pos[id].y + 60 <= 145).length;
  assert(noVao >= 8, 'só ' + noVao + ' entraram no vão');
  // as do vão não invadem a parte cheia da grande (com o espaço de 5 mm)
  for (const id of Object.keys(r.pos)) {
    if (id === 'G') continue;
    const p = r.pos[id];
    const tocaCheia = p.y < 300 + 5 && p.y + 60 > 150 - 5 ? true : p.y < 150 && p.x + 80 > 400 - 5;
    assert(!tocaCheia || p.y >= 305, id + ' encosta na parte cheia: ' + JSON.stringify(p));
  }
  assert(sobrepoe(grande, 0, 0, perfilRetangulo(80, 60), 0, 0) === false, 'o canto vazio não conta como ocupado');
  assert(sobrepoe(grande, 0, 0, perfilRetangulo(80, 60), 390, 0) === true, 'a parte cheia conta como ocupada');
});

caso('espaço zero encosta mas não sobrepõe', () => {
  const novas = [];
  for (let i = 0; i < 30; i++) novas.push({ id: 'z' + i, w: 94, h: 80, rot: 0 });
  const r = encaixar({ largura: LARG, espaco: 0, girar: false, novas });
  conferir(novas, r, 0);
  assert.strictEqual(r.fundo, 400); // 6 por linha, 5 linhas
});

caso('cópias da mesma arte: todas posicionadas', () => {
  const novas = [];
  for (let i = 0; i < 60; i++) novas.push({ id: 'c' + i, w: 80, h: 75, rot: 0 });
  const r = encaixar({ largura: LARG, espaco: 5, novas });
  assert.strictEqual(Object.keys(r.pos).length, 60);
  conferir(novas, r, 5);
});

if (falhas) { console.log(falhas + ' falha(s)'); process.exit(1); }
console.log('encaixe: tudo certo');
