// node testes/teste-encaixe.js — confere o encaixe: nada sobreposto, tudo dentro da largura, espaço mínimo e cópias certas.
'use strict';
const assert = require('assert');
const { encaixar } = require('../site/encaixe.js');

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

caso('novas entram sem mexer nas que já estão', () => {
  const fixas = [{ x: 0, y: 0, w: 300, h: 300 }, { x: 400, y: 50, w: 100, h: 100 }];
  const novas = [];
  for (let i = 0; i < 40; i++) novas.push({ id: 'n' + i, w: 30 + sorteio() * 120, h: 30 + sorteio() * 120, rot: 0 });
  const r = encaixar({ largura: LARG, espaco: 5, fixas, novas });
  assert.strictEqual(r.fora.length, 0);
  conferir(novas, r, 5, fixas);
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
