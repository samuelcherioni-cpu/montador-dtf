// Encaixe automático das artes no filme (MaxRects, regra "mais embaixo-à esquerda").
// Tudo em milímetros. A área útil começa em (0, 0); quem chama soma a margem.
(function (raiz) {
  'use strict';
  const EPS = 0.001;
  const SEM_FIM = 1e7; // comprimento livre: o filme cresce para baixo

  function cruza(a, b) {
    return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  }
  function contem(a, b) {
    return b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;
  }

  class Area {
    constructor(largura, altura) { this.livres = [{ x: 0, y: 0, w: largura, h: altura }]; }

    ocupar(r) {
      const novos = [];
      for (const f of this.livres) {
        if (!cruza(f, r)) { novos.push(f); continue; }
        if (r.x > f.x + EPS) novos.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
        if (r.x + r.w < f.x + f.w - EPS) novos.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
        if (r.y > f.y + EPS) novos.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
        if (r.y + r.h < f.y + f.h - EPS) novos.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
      }
      // tira os espaços que estão dentro de outro maior
      const lista = novos.filter((f) => f.w > EPS && f.h > EPS);
      this.livres = lista.filter((f, i) => !lista.some((g, j) => j !== i && contem(g, f) && (!contem(f, g) || j < i)));
    }

    lugar(w, h) {
      let melhor = null;
      for (const f of this.livres) {
        if (w > f.w + EPS || h > f.h + EPS) continue;
        const fundo = f.y + h;
        if (!melhor || fundo < melhor.fundo - EPS || (Math.abs(fundo - melhor.fundo) <= EPS && f.x < melhor.x)) {
          melhor = { x: f.x, y: f.y, fundo };
        }
      }
      return melhor;
    }
  }

  // largura: largura útil; espaco: distância mínima entre artes; girar: pode virar 90°
  // fixas: [{x, y, w, h}] já no filme; novas: [{id, w, h, rot, fixo}] com w × h da arte sem giro, rot = giro preferido (0 ou 90)
  // e fixo = true quando o giro foi escolhido à mão e não pode mudar
  function rodada(largura, espaco, girar, fixas, novas) {
    const area = new Area(largura + espaco, SEM_FIM);
    for (const r of fixas) area.ocupar({ x: r.x, y: r.y, w: r.w + espaco, h: r.h + espaco });
    const pos = {}, fora = [];
    let fundo = 0;
    for (const p of fixas) fundo = Math.max(fundo, p.y + p.h);
    for (const n of novas) {
      const opcoes = girar && !n.fixo ? [n.rot, n.rot ? 0 : 90] : [n.rot];
      let melhor = null;
      for (const rot of opcoes) {
        const w = rot ? n.h : n.w, h = rot ? n.w : n.h;
        if (w > largura + EPS) continue;
        const l = area.lugar(w + espaco, h + espaco);
        if (l && (!melhor || l.fundo < melhor.fundo - EPS || (Math.abs(l.fundo - melhor.fundo) <= EPS && l.x < melhor.x))) {
          melhor = { x: l.x, y: l.y, fundo: l.fundo, rot, w, h };
        }
      }
      if (!melhor) { fora.push(n.id); continue; }
      area.ocupar({ x: melhor.x, y: melhor.y, w: melhor.w + espaco, h: melhor.h + espaco });
      pos[n.id] = { x: melhor.x, y: melhor.y, rot: melhor.rot };
      fundo = Math.max(fundo, melhor.y + melhor.h);
    }
    return { pos, fora, fundo };
  }

  function encaixar({ largura, espaco = 5, girar = true, fixas = [], novas }) {
    const maior = (n) => Math.max(n.w, n.h);
    const ordens = [
      [...novas].sort((a, b) => maior(b) - maior(a) || b.w * b.h - a.w * a.h),
      [...novas].sort((a, b) => b.w * b.h - a.w * a.h || maior(b) - maior(a)),
      [...novas].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || maior(b) - maior(a)),
    ];
    let melhor = null;
    for (const ordem of ordens) {
      const r = rodada(largura, espaco, girar, fixas, ordem);
      if (!melhor || r.fora.length < melhor.fora.length || (r.fora.length === melhor.fora.length && r.fundo < melhor.fundo - EPS)) melhor = r;
    }
    return melhor;
  }

  const Encaixe = { encaixar, cruza };
  if (typeof module === 'object' && module.exports) module.exports = Encaixe;
  else raiz.Encaixe = Encaixe;
})(typeof self !== 'undefined' ? self : this);
