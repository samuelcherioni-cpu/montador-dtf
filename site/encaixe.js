// Encaixe automático das artes no filme pelo FORMATO REAL de cada arte (não pelo retângulo).
// Cada arte vira um "perfil": para cada linha de 1 mm, TODOS os trechos onde há desenho (não só onde
// começa e termina). Assim uma arte pequena entra no vão de outra, inclusive em vãos internos
// (ex.: entre o rosto e um raio do logo).
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

  // Trechos de cada linha: lista [a0, b0, a1, b1, ...] (de a até antes de b). Vem de p.spans (formato
  // real, vários trechos) ou, se não houver, de p.L/p.R (um trecho por linha).
  function trechos(p) {
    if (p.S) return p.S;
    const S = new Array(p.linhas);
    for (let y = 0; y < p.linhas; y++) {
      if (p.spans) S[y] = p.spans[y] || [];
      else S[y] = p.L[y] < p.R[y] ? [p.L[y], p.R[y]] : [];
    }
    p.S = S;
    return S;
  }

  // junta trechos que se tocam ou se sobrepõem
  function juntar(pares) {
    if (!pares.length) return [];
    pares.sort((u, v) => u[0] - v[0]);
    const saida = [];
    let a = pares[0][0], b = pares[0][1];
    for (let k = 1; k < pares.length; k++) {
      const c = pares[k][0], e = pares[k][1];
      if (c <= b) { if (e > b) b = e; } else { saida.push(a, b); a = c; b = e; }
    }
    saida.push(a, b);
    return saida;
  }

  // Engorda o perfil em d células para todos os lados (garante o espaço entre artes)
  function engordar(p, d) {
    const S = trechos(p);
    const linhas = p.linhas + 2 * d;
    const G = new Array(linhas);
    for (let i = 0; i < linhas; i++) {
      const pares = [];
      for (let j = i - 2 * d; j <= i; j++) {
        if (j < 0 || j >= p.linhas) continue;
        const t = S[j];
        for (let k = 0; k < t.length; k += 2) pares.push([t[k] - d, t[k + 1] + d]);
      }
      G[i] = juntar(pares);
    }
    return { cols: p.cols + 2 * d, linhas, S: G, d };
  }

  // primeira e última linha com desenho, o trecho mais largo de cada linha e o menor desses
  function medir(p) {
    const S = trechos(p);
    p.primeira = 0; p.ultima = -1; p.menor = 32767;
    p.largo = new Int16Array(p.linhas);
    for (let j = 0; j < p.linhas; j++) {
      const t = S[j];
      let larg = 0;
      for (let k = 0; k < t.length; k += 2) larg = Math.max(larg, t[k + 1] - t[k]);
      p.largo[j] = larg;
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
    inserir(gy, a, b) {
      while (this.linhas.length <= gy) this.linhas.push([]);
      const nova = [];
      let pos = 0;
      for (const t of this.linhas[gy]) {
        if (t[1] < a) { nova.push(t); pos++; } else if (t[0] > b) nova.push(t);
        else { a = Math.min(a, t[0]); b = Math.max(b, t[1]); }
      }
      nova.splice(pos, 0, [a, b]);
      this.linhas[gy] = nova;
    }
    ocupar(p, x, y) {
      const S = trechos(p);
      for (let i = 0; i < p.linhas; i++) {
        const t = S[i];
        if (!t.length) continue;
        for (let k = 0; k < t.length; k += 2) this.inserir(y + i, x + t[k], x + t[k + 1]);
        this.medirFolga(y + i);
      }
    }
    // primeiro x livre na altura y para a peça (perfil engordado g, caixa de cols colunas); -1 se não houver
    xLivre(g, cols, y) {
      const proibidos = [];
      for (let i = 0; i < g.linhas; i++) {
        const t = g.S[i];
        if (!t.length) continue;
        const lista = this.linha(y + i - g.d);
        if (!lista) continue;
        for (const [a, b] of lista) for (let k = 0; k < t.length; k += 2) proibidos.push([a - t[k + 1] + 1, b - t[k] - 1]);
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
        const larg = p.largo[j];
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
  // jeito.giro: 'livre' (cada cópia escolhe), 'em-pe' (só gira se não couber) ou 'deitado' (gira sempre que couber)
  // jeito.criterio: 'fundo' (a que termina mais em cima) ou 'topo' (a que começa mais em cima)
  function rodada(largura, espaco, girar, novas, jeito = { giro: 'livre', criterio: 'fundo' }) {
    const colunas = Math.floor(largura / CELULA + 1e-6);
    const d = Math.max(0, Math.ceil(espaco / CELULA - 1e-6));
    const filme = new Filme(colunas);
    const cursor = new Map(); // forma+giro -> menor y possível (só cresce, porque o filme só enche)
    const pos = {}, fora = [];
    let fundo = 0, soma = 0;
    for (const n of novas) {
      const criterio = jeito.criterioDaPeca ? jeito.criterioDaPeca() : jeito.criterio;
      let opcoes;
      const daForma = jeito.porForma && jeito.porForma.get(n.forma || n.id);
      if (!girar || n.fixo) opcoes = [n.rot];
      else if (daForma !== undefined && daForma !== 'livre' && n.perfis[daForma].cols <= colunas) opcoes = [daForma];
      else if (jeito.giro === 'livre' || daForma === 'livre') opcoes = [0, 90];
      else {
        const pref = jeito.giro === 'deitado' ? 90 : 0, outro = pref ? 0 : 90;
        opcoes = n.perfis[pref].cols <= colunas ? [pref] : [outro];
      }
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
        if (criterio === 'esquerda' && x > 0) {
          // procura mais abaixo uma posição mais à esquerda (para quando encostar no canto rende mais)
          for (let yy = y + 1; ; yy++) {
            if (filme.sobra(yy - d)) { if (yy - y <= p.linhas) { x = 0; y = yy; } break; }
            if (yy - y > p.linhas) break;
            if (filme.proximoY(p, yy) !== yy) continue;
            const xx = filme.xLivre(p.gordo, p.cols, yy);
            if (xx >= 0 && xx < x) { x = xx; y = yy; if (x === 0) break; }
          }
        }
        const baixo = y + p.linhas;
        const ganha = !melhor || (criterio === 'esquerda'
          ? x < melhor.x || (x === melhor.x && baixo < melhor.baixo)
          : criterio === 'topo'
          ? y < melhor.y || (y === melhor.y && (x < melhor.x || (x === melhor.x && baixo < melhor.baixo)))
          : baixo < melhor.baixo || (baixo === melhor.baixo && x < melhor.x));
        if (ganha) melhor = { x, y, rot, p, baixo };
      }
      if (!melhor) { fora.push(n.id); continue; }
      filme.ocupar(melhor.p, melhor.x, melhor.y);
      pos[n.id] = { x: melhor.x * CELULA, y: melhor.y * CELULA, rot: melhor.rot };
      fundo = Math.max(fundo, melhor.baixo * CELULA);
      soma += melhor.baixo * 4096 + melhor.x; // desempate: peças mais em cima (e mais à esquerda)
    }
    return { pos, fora, fundo, soma };
  }

  function prepararPerfis(n) {
    if (n.perfis) return n;
    const c0 = Math.ceil(n.w / CELULA - 1e-6), l0 = Math.ceil(n.h / CELULA - 1e-6);
    return { ...n, perfis: { 0: perfilRetangulo(c0, l0), 90: perfilRetangulo(l0, c0) } };
  }

  // Tenta várias combinações de ordem e de giro e fica com a que gasta menos filme.
  // limiteMs: tempo máximo de tentativas (as primeiras rodam sempre).
  function encaixar({ largura, espaco = 5, girar = true, novas, limiteMs = 700 }) {
    const lista = novas.map(prepararPerfis);
    const area = (n) => n.w * n.h;
    const maior = (n) => Math.max(n.w, n.h);
    const menor = (n) => Math.min(n.w, n.h);
    const ordenar = (f, g) => [...lista].sort((a, b) => f(b) - f(a) || g(b) - g(a));
    const porArea = ordenar(area, maior), porMaior = ordenar(maior, area), porMenor = ordenar(menor, area);
    const tentativas = [
      [porArea, 'livre', 'fundo'], [porMaior, 'livre', 'fundo'], [porArea, 'livre', 'topo'],
      [porArea, 'em-pe', 'fundo'], [porArea, 'deitado', 'fundo'], [porMaior, 'livre', 'topo'],
      [porMaior, 'em-pe', 'fundo'], [porMaior, 'deitado', 'fundo'], [porMenor, 'livre', 'fundo'],
      [porMenor, 'livre', 'topo'], [porArea, 'em-pe', 'topo'], [porArea, 'deitado', 'topo'],
      [porArea, 'livre', 'esquerda'], [porMaior, 'livre', 'esquerda'],
    ];
    const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const inicio = agora();
    let melhor = null, feitas = 0, semMelhora = 0;
    const guardar = (r) => {
      feitas++;
      // menos peças de fora; depois filme mais curto; empatando, tudo mais em cima e junto
      // (o espaço que sobra fica contínuo embaixo e do lado)
      const melhorou = !melhor || r.fora.length < melhor.fora.length || (r.fora.length === melhor.fora.length &&
        (r.fundo < melhor.fundo || (r.fundo === melhor.fundo && r.soma < melhor.soma)));
      if (melhorou) { melhor = r; semMelhora = 0; }
      else semMelhora++;
    };
    for (const [ordem, giro, criterio] of tentativas) {
      if (feitas >= 3 && agora() - inicio > limiteMs) break;
      if (!girar && giro !== 'livre') continue;
      guardar(rodada(largura, espaco, girar, ordem, { giro, criterio }));
    }

    // Com o tempo que sobra: sorteia outras combinações (ordem das peças, giro de cada arte e critério)
    // e fica com a melhor. O sorteio é sempre o mesmo para a mesma fila, então o resultado não "pula".
    let semente = 20261112 + lista.length * 7919;
    const sorte = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 4294967296);
    const formas = [...new Set(lista.map((n) => n.forma || n.id))];
    // para antes do tempo quando 120 sorteios seguidos não acharam nada melhor (filas pequenas respondem rápido)
    while (agora() - inicio < limiteMs && semMelhora < 120) {
      const peso = new Map(lista.map((n) => [n, area(n) * (0.35 + sorte() * 1.3)]));
      const ordem = sorte() < 0.2
        ? [...lista].sort(() => sorte() - 0.5)
        : [...lista].sort((a, b) => peso.get(b) - peso.get(a));
      const porForma = new Map();
      if (girar) for (const f of formas) { const t = sorte(); porForma.set(f, t < 0.4 ? 'livre' : t < 0.7 ? 0 : 90); }
      const qual = () => { const t = sorte(); return t < 0.45 ? 'fundo' : t < 0.7 ? 'topo' : 'esquerda'; };
      // metade das vezes um critério só; na outra metade cada peça sorteia o seu
      const jeito = sorte() < 0.5 ? { giro: 'livre', criterio: qual(), porForma } : { giro: 'livre', criterioDaPeca: qual, porForma };
      guardar(rodada(largura, espaco, girar, ordem, jeito));
    }
    melhor.tentativas = feitas;
    return melhor;
  }

  // As partes não transparentes de duas peças se tocam? (posições em mm, perfis no giro de cada uma)
  function sobrepoe(pa, xa, ya, pb, xb, yb) {
    const ax = Math.round(xa / CELULA), ay = Math.round(ya / CELULA), bx = Math.round(xb / CELULA), by = Math.round(yb / CELULA);
    const y0 = Math.max(ay, by), y1 = Math.min(ay + pa.linhas, by + pb.linhas);
    const SA = trechos(pa), SB = trechos(pb);
    for (let y = y0; y < y1; y++) {
      const ta = SA[y - ay], tb = SB[y - by];
      for (let k = 0; k < ta.length; k += 2) {
        for (let m = 0; m < tb.length; m += 2) {
          if (ax + ta[k] < bx + tb[m + 1] && bx + tb[m] < ax + ta[k + 1]) return true;
        }
      }
    }
    return false;
  }

  const Encaixe = { encaixar, sobrepoe, perfilRetangulo, CELULA };
  if (typeof module === 'object' && module.exports) module.exports = Encaixe;
  else raiz.Encaixe = Encaixe;
})(typeof self !== 'undefined' ? self : this);
