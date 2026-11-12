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

  // Onde está o desenho dentro da caixa (primeira/última linha e coluna mais à esquerda/direita),
  // o trecho mais largo de cada linha e o menor desses. A sobra transparente em volta não conta.
  function medir(p) {
    if (p.menor !== undefined) return p;
    const S = trechos(p);
    p.primeira = 0; p.ultima = -1; p.menor = 32767; p.esq = 32767; p.dir = 0;
    p.largo = new Int16Array(p.linhas);
    for (let j = 0; j < p.linhas; j++) {
      const t = S[j];
      let larg = 0;
      for (let k = 0; k < t.length; k += 2) {
        larg = Math.max(larg, t[k + 1] - t[k]);
        if (t[k] < p.esq) p.esq = t[k];
        if (t[k + 1] > p.dir) p.dir = t[k + 1];
      }
      p.largo[j] = larg;
      if (larg <= 0) continue;
      if (p.ultima < 0) p.primeira = j;
      p.ultima = j;
      if (larg < p.menor) p.menor = larg;
    }
    if (p.ultima < 0) { p.esq = 0; p.dir = 0; }
    return p;
  }
  const largDesenho = (p) => { medir(p); return p.dir - p.esq; };

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
    // Primeira posição x livre (entre xMin e xMax) na altura y para a peça de perfil engordado g; null se não houver.
    // Marca numa régua (diferenças acumuladas) as posições proibidas e devolve a primeira livre.
    // Sem ordenar nada: é a parte que mais roda no encaixe.
    xLivre(g, xMin, xMax, y) {
      if (xMax < xMin) return null;
      const maxX = xMax - xMin; // a régua começa em xMin
      if (!this.regua || this.regua.length < maxX + 2) this.regua = new Int32Array(maxX + 2 + this.colunas);
      const regua = this.regua;
      regua.fill(0, 0, maxX + 2);
      let algum = false;
      for (let i = 0; i < g.linhas; i++) {
        const t = g.S[i];
        if (!t.length) continue;
        const lista = this.linha(y + i - g.d);
        if (!lista) continue;
        for (let m = 0; m < lista.length; m++) {
          const a = lista[m][0], b = lista[m][1];
          for (let k = 0; k < t.length; k += 2) {
            let lo = a - t[k + 1] + 1 - xMin, hi = b - t[k] - 1 - xMin;
            if (hi < 0 || lo > maxX) continue;
            if (lo <= 0 && hi >= maxX) return null; // esta linha sozinha já fecha todas as posições
            if (lo < 0) lo = 0;
            if (hi > maxX) hi = maxX;
            regua[lo]++; regua[hi + 1]--;
            algum = true;
          }
        }
      }
      if (!algum) return xMin;
      let soma = 0;
      for (let x = 0; x <= maxX; x++) { soma += regua[x]; if (soma === 0) return x + xMin; }
      return null;
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
      else if (daForma !== undefined && daForma !== 'livre' && largDesenho(n.perfis[daForma]) <= colunas) opcoes = [daForma];
      else if (jeito.giro === 'livre' || daForma === 'livre') opcoes = [0, 90];
      else {
        const pref = jeito.giro === 'deitado' ? 90 : 0, outro = pref ? 0 : 90;
        opcoes = largDesenho(n.perfis[pref]) <= colunas ? [pref] : [outro];
      }
      let melhor = null;
      for (const rot of opcoes) {
        const p = medir(n.perfis[rot]);
        if (p.dir - p.esq > colunas) continue;
        if (!p.gordo || p.gordo.d !== d) p.gordo = engordar(p, d);
        const chave = (n.forma || n.id) + '|' + rot;
        // só a parte desenhada precisa ficar dentro do filme; a sobra transparente da caixa pode passar da borda
        const xMin = 0 - p.esq, xMax = colunas - p.dir, yMin = 0 - p.primeira;
        let y = Math.max(yMin, cursor.get(chave) ?? yMin), x = null;
        for (;;) {
          if (filme.sobra(y + p.primeira - d)) { x = xMin; break; } // abaixo de tudo: sempre cabe
          const salto = filme.proximoY(p, y);
          if (salto !== y) { y = salto; continue; }
          x = filme.xLivre(p.gordo, xMin, xMax, y);
          if (x !== null) break;
          y++;
        }
        cursor.set(chave, y);
        if (criterio === 'esquerda' && x > xMin) {
          // procura mais abaixo uma posição mais à esquerda (para quando encostar no canto rende mais)
          for (let yy = y + 1; ; yy++) {
            if (filme.sobra(yy + p.primeira - d)) { if (yy - y <= p.linhas) { x = xMin; y = yy; } break; }
            if (yy - y > p.linhas) break;
            if (filme.proximoY(p, yy) !== yy) continue;
            const xx = filme.xLivre(p.gordo, xMin, xMax, yy);
            if (xx !== null && xx < x) { x = xx; y = yy; if (x === xMin) break; }
          }
        }
        const baixo = y + p.ultima + 1; // onde o desenho termina (a sobra transparente embaixo não gasta filme)
        const ganha = !melhor || (criterio === 'esquerda'
          ? x < melhor.x || (x === melhor.x && baixo < melhor.baixo)
          : criterio === 'topo'
          ? y + p.primeira < melhor.topo || (y + p.primeira === melhor.topo && (x < melhor.x || (x === melhor.x && baixo < melhor.baixo)))
          : baixo < melhor.baixo || (baixo === melhor.baixo && x < melhor.x));
        if (ganha) melhor = { x, y, rot, p, baixo, topo: y + p.primeira };
      }
      if (!melhor) { fora.push(n.id); continue; }
      filme.ocupar(melhor.p, melhor.x, melhor.y);
      pos[n.id] = { x: melhor.x * CELULA, y: melhor.y * CELULA, rot: melhor.rot };
      fundo = Math.max(fundo, melhor.baixo * CELULA);
      soma += melhor.baixo * 4096 + melhor.x; // desempate: peças mais em cima (e mais à esquerda)
    }
    return { pos, fora, fundo, soma, receita: { ordem: novas, jeito } };
  }

  // Passada de "tapar buracos": pega as peças que terminam mais embaixo (as que definem o tamanho da
  // folha) e tenta colocar cada uma no primeiro espaço livre mais acima, com as outras paradas onde estão.
  // Se subir, fica lá. Repete enquanto encurtar a folha e houver tempo.
  function compactar(largura, espaco, girar, lista, r, prazo, agora) {
    const colunas = Math.floor(largura / CELULA + 1e-6);
    const d = Math.max(0, Math.ceil(espaco / CELULA - 1e-6));
    const pecas = lista.filter((n) => r.pos[n.id]).map((n) => {
      const q = r.pos[n.id];
      return { n, rot: q.rot, x: Math.round(q.x / CELULA), y: Math.round(q.y / CELULA), p: medir(n.perfis[q.rot]) };
    });
    const baixoDe = (q) => q.y + q.p.ultima + 1;
    let mexeu = false;
    for (let volta = 0; volta < 6 && agora() < prazo; volta++) {
      let subiu = false;
      pecas.sort((a, b) => baixoDe(b) - baixoDe(a));
      const tentar = Math.min(pecas.length, 40);
      for (let k = 0; k < tentar && agora() < prazo; k++) {
        const alvo = pecas[k];
        const antes = baixoDe(alvo);
        const filme = new Filme(colunas);
        for (const q of pecas) if (q !== alvo) filme.ocupar(q.p, q.x, q.y);
        const opcoes = girar && !alvo.n.fixo ? [0, 90] : [alvo.rot];
        let melhor = null;
        for (const rot of opcoes) {
          const p = medir(alvo.n.perfis[rot]);
          if (p.dir - p.esq > colunas) continue;
          if (!p.gordo || p.gordo.d !== d) p.gordo = engordar(p, d);
          const xMin = 0 - p.esq, xMax = colunas - p.dir;
          for (let y = 0 - p.primeira; y + p.ultima + 1 < (melhor ? melhor.baixo : antes); y++) {
            if (filme.sobra(y + p.primeira - d)) break;
            const salto = filme.proximoY(p, y);
            if (salto !== y) { y = salto - 1; continue; }
            const x = filme.xLivre(p.gordo, xMin, xMax, y);
            if (x !== null) { melhor = { x, y, rot, p, baixo: y + p.ultima + 1 }; break; }
          }
        }
        if (melhor && melhor.baixo < antes) {
          Object.assign(alvo, { x: melhor.x, y: melhor.y, rot: melhor.rot, p: melhor.p });
          subiu = mexeu = true;
        }
      }
      if (!subiu) break;
    }
    if (!mexeu) return r;
    const pos = {};
    let fundo = 0, soma = 0;
    for (const q of pecas) {
      pos[q.n.id] = { x: q.x * CELULA, y: q.y * CELULA, rot: q.rot };
      fundo = Math.max(fundo, baixoDe(q) * CELULA);
      soma += baixoDe(q) * 4096 + q.x;
    }
    return { ...r, pos, fundo, soma, compactada: true };
  }

  function prepararPerfis(n) {
    if (n.perfis) return n;
    const c0 = Math.ceil(n.w / CELULA - 1e-6), l0 = Math.ceil(n.h / CELULA - 1e-6);
    return { ...n, perfis: { 0: perfilRetangulo(c0, l0), 90: perfilRetangulo(l0, c0) } };
  }

  // Tenta várias combinações de ordem e de giro e fica com a que gasta menos filme.
  // limiteMs: tempo máximo de tentativas (as primeiras rodam sempre).
  function encaixar({ largura, espaco = 5, girar = true, novas, limiteMs = 700, aoMelhorar }) {
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
      if (melhorou) { melhor = r; semMelhora = 0; if (aoMelhorar) aoMelhorar(melhor); }
      else semMelhora++;
    };
    // a busca usa 80% do tempo; o resto fica para a passada de tapar buracos no fim
    const acabou = () => agora() - inicio > limiteMs * 0.8;
    for (const [ordem, giro, criterio] of tentativas) {
      if (feitas >= 3 && acabou()) break;
      if (!girar && giro !== 'livre') continue;
      guardar(rodada(largura, espaco, girar, ordem, { giro, criterio }));
    }

    let semente = 20261112 + lista.length * 7919;
    const sorte = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 4294967296);
    // artes que podem ficar tanto em pé quanto deitadas (as outras não têm escolha)
    const formas = [...new Set(lista.filter((n) => girar && !n.fixo && largDesenho(n.perfis[0]) <= Math.floor(largura / CELULA) &&
      largDesenho(n.perfis[90]) <= Math.floor(largura / CELULA)).map((n) => n.forma || n.id))];

    // 1) Poucas artes diferentes: testa TODAS as combinações de giro (cada arte em pé ou deitada),
    //    em duas ordens. Assim a combinação que alguém acharia testando à mão sempre entra na conta.
    if (formas.length && formas.length <= 9) {
      const total = 1 << formas.length;
      for (const ordem of [porArea, porMaior]) {
        for (let m = 0; m < total && !acabou(); m++) {
          const porForma = new Map(formas.map((f, i) => [f, (m >> i) & 1 ? 90 : 0]));
          guardar(rodada(largura, espaco, girar, ordem, { giro: 'livre', criterio: 'fundo', porForma }));
        }
      }
    }

    // 2) Busca local a partir da melhor montagem: troca a ordem de duas peças, vira o giro de uma arte
    //    ou muda a regra de posição; fica com a mudança se não piorar. De vez em quando recomeça de um
    //    sorteio novo. O sorteio é sempre o mesmo para a mesma fila, então o resultado não "pula".
    const qual = () => { const t = sorte(); return t < 0.5 ? 'fundo' : t < 0.75 ? 'topo' : 'esquerda'; };
    const sortear = () => {
      const peso = new Map(lista.map((n) => [n, area(n) * (0.35 + sorte() * 1.3)]));
      const ordem = sorte() < 0.2 ? [...lista].sort(() => sorte() - 0.5) : [...lista].sort((a, b) => peso.get(b) - peso.get(a));
      const porForma = new Map();
      for (const f of formas) { const t = sorte(); porForma.set(f, t < 0.4 ? 'livre' : t < 0.7 ? 0 : 90); }
      return { ordem, jeito: sorte() < 0.5 ? { giro: 'livre', criterio: qual(), porForma } : { giro: 'livre', criterioDaPeca: qual, porForma } };
    };
    let atual = melhor;
    while (!acabou() && semMelhora < 400) {
      let receita;
      if (sorte() < 0.15 || !atual.receita) receita = sortear();
      else {
        const base = atual.receita;
        const ordem = [...base.ordem];
        const jeito = { ...base.jeito, porForma: new Map(base.jeito.porForma || []) };
        const t = sorte();
        if (t < 0.4 && ordem.length > 1) { // troca duas peças de lugar na ordem
          const i = Math.floor(sorte() * ordem.length), j = Math.floor(sorte() * ordem.length);
          [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
        } else if (t < 0.55 && ordem.length > 1) { // leva uma peça para a frente
          const i = Math.floor(sorte() * ordem.length), [p] = ordem.splice(i, 1);
          ordem.splice(Math.floor(sorte() * i), 0, p);
        } else if (t < 0.85 && formas.length) { // vira o giro de uma arte
          const f = formas[Math.floor(sorte() * formas.length)], v = jeito.porForma.get(f);
          jeito.porForma.set(f, v === 0 ? 90 : v === 90 ? (sorte() < 0.5 ? 0 : 'livre') : (sorte() < 0.5 ? 0 : 90));
        } else { delete jeito.criterioDaPeca; jeito.criterio = qual(); }
        receita = { ordem, jeito };
      }
      const r = rodada(largura, espaco, girar, receita.ordem, receita.jeito);
      guardar(r);
      const naoPiorou = r.fora.length < atual.fora.length || (r.fora.length === atual.fora.length && (r.fundo < atual.fundo || (r.fundo === atual.fundo && r.soma <= atual.soma)));
      if (naoPiorou) atual = r;
      else if (sorte() < 0.03) atual = melhor; // volta para a melhor de todas de vez em quando
    }
    // tapa buracos na melhor montagem (e também na segunda volta, se ainda houver tempo)
    const compacta = compactar(largura, espaco, girar, lista, melhor, inicio + Math.max(limiteMs, 50), agora);
    if (compacta !== melhor && (compacta.fundo < melhor.fundo || (compacta.fundo === melhor.fundo && compacta.soma < melhor.soma))) {
      melhor = compacta;
      if (aoMelhorar) aoMelhorar(melhor);
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

  // Onde está o desenho dentro da caixa da peça (em células): {esq, dir, primeira, ultima}
  function limites(p) { medir(p); return { esq: p.esq, dir: p.dir, primeira: p.primeira, ultima: p.ultima }; }

  const Encaixe = { encaixar, sobrepoe, perfilRetangulo, limites, CELULA };
  if (typeof module === 'object' && module.exports) module.exports = Encaixe;
  else raiz.Encaixe = Encaixe;
})(typeof self !== 'undefined' ? self : this);
