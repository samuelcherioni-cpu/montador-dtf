// Encaixe automático das artes no filme pelo FORMATO REAL de cada arte (não pelo retângulo).
// Cada arte vira um "perfil": para cada linha de 1 mm, onde a parte não transparente começa e termina.
// Assim uma arte pequena entra no vão de outra (ex.: no canto vazio ao lado de um desenho).
// Regra de posição: mais em cima possível, depois mais à esquerda. Tudo em células de 1 mm.
(function (raiz) {
  'use strict';
  const CELULA = 1; // mm

  // Perfil retangular cheio (usado quando não há imagem, ex.: nos testes)
  function perfilRetangulo(cols, linhas) {
    const L = new Int16Array(linhas), R = new Int16Array(linhas);
    R.fill(cols);
    return { cols, linhas, L, R };
  }

  // Engorda o perfil em d células para todos os lados (garante o espaço entre artes)
  function engordar(p, d) {
    const linhas = p.linhas + 2 * d;
    const L = new Int16Array(linhas), R = new Int16Array(linhas);
    for (let i = 0; i < linhas; i++) {
      let l = 32767, r = -32768;
      for (let j = i - 2 * d; j <= i; j++) {
        if (j < 0 || j >= p.linhas || p.L[j] >= p.R[j]) continue;
        if (p.L[j] < l) l = p.L[j];
        if (p.R[j] > r) r = p.R[j];
      }
      if (l < r) { L[i] = l - d; R[i] = r + d; } else { L[i] = 0; R[i] = 0; }
    }
    return { cols: p.cols + 2 * d, linhas, L, R, d };
  }

  // primeira e última linha com desenho e a linha mais estreita do perfil
  function medir(p) {
    p.primeira = 0; p.ultima = -1; p.menor = 32767;
    for (let j = 0; j < p.linhas; j++) {
      const larg = p.R[j] - p.L[j];
      if (larg <= 0) continue;
      if (p.ultima < 0) p.primeira = j;
      p.ultima = j;
      if (larg < p.menor) p.menor = larg;
    }
  }

  // O filme: para cada linha, a lista de trechos ocupados [a, b)
  class Filme {
    constructor(colunas) { this.colunas = colunas; this.linhas = []; this.folga = []; }
    // maior trecho livre de cada linha (para descartar rápido as alturas onde a peça não cabe)
    maiorFolga(y) { return y < this.folga.length ? this.folga[y] : this.colunas; }
    medirFolga(gy) {
      let maior = 0, x = 0;
      for (const [a, b] of this.linhas[gy]) { if (a > x) maior = Math.max(maior, Math.min(a, this.colunas) - x); x = Math.max(x, b); }
      if (this.colunas > x) maior = Math.max(maior, this.colunas - x);
      while (this.folga.length <= gy) this.folga.push(this.colunas);
      this.folga[gy] = maior;
    }
    linha(y) { return y >= 0 && y < this.linhas.length ? this.linhas[y] : null; }
    ocupar(p, x, y) {
      for (let i = 0; i < p.linhas; i++) {
        if (p.L[i] >= p.R[i]) continue;
        const gy = y + i;
        while (this.linhas.length <= gy) this.linhas.push([]);
        const lista = this.linhas[gy];
        let a = x + p.L[i], b = x + p.R[i];
        const nova = [];
        let pos = 0;
        for (const t of lista) {
          if (t[1] < a) { nova.push(t); pos++; } else if (t[0] > b) nova.push(t);
          else { a = Math.min(a, t[0]); b = Math.max(b, t[1]); }
        }
        nova.splice(pos, 0, [a, b]);
        this.linhas[gy] = nova;
        this.medirFolga(gy);
      }
    }
    // primeiro x livre na altura y para a peça (perfil engordado g, caixa de cols colunas); -1 se não houver
    xLivre(g, cols, y) {
      const proibidos = [];
      for (let i = 0; i < g.linhas; i++) {
        if (g.L[i] >= g.R[i]) continue;
        const lista = this.linha(y + i - g.d);
        if (!lista) continue;
        for (const [a, b] of lista) proibidos.push([a - g.R[i] + 1, b - g.L[i] - 1]);
      }
      const maxX = this.colunas - cols;
      if (maxX < 0) return -1;
      if (!proibidos.length) return 0;
      proibidos.sort((p, q) => p[0] - q[0]);
      let x = 0;
      for (const [a, b] of proibidos) {
        if (a > x) break;
        if (b >= x) x = b + 1;
        if (x > maxX) return -1;
      }
      return x <= maxX ? x : -1;
    }
    sobra(y) { return y >= this.linhas.length; }
    // próxima altura que vale a pena testar: pula de uma vez as linhas cheias demais para a peça
    proximoY(p, y) {
      for (let j = p.ultima; j >= p.primeira; j--) {
        const larg = p.R[j] - p.L[j];
        if (larg <= 0) continue;
        const folga = this.maiorFolga(y + j);
        if (folga >= larg) continue;
        return folga < p.menor ? y + j - p.primeira + 1 : y + 1;
      }
      return y;
    }
  }

  // largura e espaco em mm; novas: [{id, w, h, rot, fixo, perfis: {0: perfil, 90: perfil}}]
  // perfil: {cols, linhas, L, R} em células de 1 mm, da caixa da arte já no giro indicado
  function rodada(largura, espaco, girar, novas) {
    const colunas = Math.floor(largura / CELULA + 1e-6);
    const d = Math.max(0, Math.ceil(espaco / CELULA - 1e-6));
    const filme = new Filme(colunas);
    const cursor = new Map(); // forma+giro -> menor y possível (só cresce, porque o filme só enche)
    const pos = {}, fora = [];
    let fundo = 0;
    for (const n of novas) {
      const opcoes = girar && !n.fixo ? [n.rot, n.rot ? 0 : 90] : [n.rot];
      let melhor = null;
      for (const rot of opcoes) {
        const p = n.perfis[rot];
        if (p.cols > colunas) continue;
        if (!p.gordo || p.gordo.d !== d) p.gordo = engordar(p, d);
        const chave = (n.forma || n.id) + '|' + rot;
        if (p.menor === undefined) medir(p);
        let y = cursor.get(chave) || 0, x = -1;
        for (;;) {
          if (filme.sobra(y - d)) { x = 0; break; } // abaixo de tudo: sempre cabe
          const salto = filme.proximoY(p, y);
          if (salto !== y) { y = salto; continue; }
          x = filme.xLivre(p.gordo, p.cols, y);
          if (x >= 0) break;
          y++;
        }
        cursor.set(chave, y);
        const baixo = y + p.linhas;
        if (!melhor || baixo < melhor.baixo || (baixo === melhor.baixo && x < melhor.x)) melhor = { x, y, rot, p, baixo };
      }
      if (!melhor) { fora.push(n.id); continue; }
      filme.ocupar(melhor.p, melhor.x, melhor.y);
      pos[n.id] = { x: melhor.x * CELULA, y: melhor.y * CELULA, rot: melhor.rot };
      fundo = Math.max(fundo, melhor.baixo * CELULA);
    }
    return { pos, fora, fundo };
  }

  function prepararPerfis(n) {
    if (n.perfis) return n;
    const c0 = Math.ceil(n.w / CELULA - 1e-6), l0 = Math.ceil(n.h / CELULA - 1e-6);
    return { ...n, perfis: { 0: perfilRetangulo(c0, l0), 90: perfilRetangulo(l0, c0) } };
  }

  function encaixar({ largura, espaco = 5, girar = true, novas }) {
    const lista = novas.map(prepararPerfis);
    const area = (n) => n.w * n.h;
    const maior = (n) => Math.max(n.w, n.h);
    const ordens = [
      [...lista].sort((a, b) => area(b) - area(a) || maior(b) - maior(a)),
      [...lista].sort((a, b) => maior(b) - maior(a) || area(b) - area(a)),
    ];
    let melhor = null;
    for (const ordem of ordens) {
      const r = rodada(largura, espaco, girar, ordem);
      if (!melhor || r.fora.length < melhor.fora.length || (r.fora.length === melhor.fora.length && r.fundo < melhor.fundo)) melhor = r;
    }
    return melhor;
  }

  // As partes não transparentes de duas peças se tocam? (posições em mm, perfis no giro de cada uma)
  function sobrepoe(pa, xa, ya, pb, xb, yb) {
    const ax = Math.round(xa / CELULA), ay = Math.round(ya / CELULA), bx = Math.round(xb / CELULA), by = Math.round(yb / CELULA);
    const y0 = Math.max(ay, by), y1 = Math.min(ay + pa.linhas, by + pb.linhas);
    for (let y = y0; y < y1; y++) {
      const i = y - ay, j = y - by;
      if (pa.L[i] >= pa.R[i] || pb.L[j] >= pb.R[j]) continue;
      if (ax + pa.L[i] < bx + pb.R[j] && bx + pb.L[j] < ax + pa.R[i]) return true;
    }
    return false;
  }

  const Encaixe = { encaixar, sobrepoe, perfilRetangulo, CELULA };
  if (typeof module === 'object' && module.exports) module.exports = Encaixe;
  else raiz.Encaixe = Encaixe;
})(typeof self !== 'undefined' ? self : this);
