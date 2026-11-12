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

  // Giros que a peça aceita: em pé (0), deitada (90), de cabeça para baixo (180) e deitada para o outro
  // lado (270). A estampa sai igual; só muda a posição no filme. Espelhar nunca (inverteria a estampa).
  const giros = (n) => (n.perfis[180] ? [0, 90, 180, 270] : [0, 90]);

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
      else if (daForma === 'pe' || daForma === 'deitado') {
        const deit = giros(n).filter((g) => g % 180), pe = giros(n).filter((g) => !(g % 180));
        const quer = daForma === 'deitado' ? deit : pe, outro = daForma === 'deitado' ? pe : deit;
        opcoes = largDesenho(n.perfis[quer[0]]) <= colunas ? quer : outro;
      }
      else if (daForma !== undefined && daForma !== 'livre' && largDesenho(n.perfis[daForma]) <= colunas) opcoes = [daForma];
      else if (jeito.giro === 'livre' || daForma === 'livre') opcoes = giros(n);
      else {
        // em pé = 0 ou 180; deitada = 90 ou 270 (se não couber, vai do outro jeito)
        const deit = giros(n).filter((g) => g % 180), pe = giros(n).filter((g) => !(g % 180));
        const pref = jeito.giro === 'deitado' ? deit : pe, outro = jeito.giro === 'deitado' ? pe : deit;
        opcoes = largDesenho(n.perfis[pref[0]]) <= colunas ? pref : outro;
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
        const opcoes = girar && !alvo.n.fixo ? giros(alvo.n) : [alvo.rot];
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

  // Encaixa só as peças novas na montagem que já existe (as outras ficam paradas): cada nova vai para o
  // primeiro espaço livre em que terminar mais em cima, em qualquer giro. Usado quando alguém adiciona
  // uma arte: se ela couber num buraco (no começo, no meio ou no fim), a folha não cresce.
  // colocadas: [{ n, pos: {x, y, rot} }] (mm); novas: peças como em encaixar()
  function acrescentar({ largura, espaco = 5, girar = true, colocadas, novas }) {
    const colunas = Math.floor(largura / CELULA + 1e-6);
    const d = Math.max(0, Math.ceil(espaco / CELULA - 1e-6));
    const filme = new Filme(colunas);
    const pos = {};
    let fundo = 0, soma = 0;
    for (const { n, pos: q } of colocadas) {
      const p = medir(prepararPerfis(n).perfis[q.rot]);
      const x = Math.round(q.x / CELULA), y = Math.round(q.y / CELULA);
      filme.ocupar(p, x, y);
      pos[n.id] = { x: x * CELULA, y: y * CELULA, rot: q.rot };
      fundo = Math.max(fundo, (y + p.ultima + 1) * CELULA);
      soma += (y + p.ultima + 1) * 4096 + x;
    }
    const fora = [];
    // as maiores primeiro (as pequenas acham buraco depois)
    const lista = novas.map(prepararPerfis).sort((a, b) => b.w * b.h - a.w * a.h);
    for (const n of lista) {
      const opcoes = girar && !n.fixo ? giros(n) : [n.rot];
      let melhor = null;
      for (const rot of opcoes) {
        const p = medir(n.perfis[rot]);
        if (p.dir - p.esq > colunas) continue;
        if (!p.gordo || p.gordo.d !== d) p.gordo = engordar(p, d);
        const xMin = 0 - p.esq, xMax = colunas - p.dir;
        for (let y = 0 - p.primeira; ; y++) {
          if (melhor && y + p.ultima + 1 >= melhor.baixo) break;
          if (filme.sobra(y + p.primeira - d)) { melhor = { x: xMin, y, rot, p, baixo: y + p.ultima + 1 }; break; }
          const salto = filme.proximoY(p, y);
          if (salto !== y) { y = salto - 1; continue; }
          const x = filme.xLivre(p.gordo, xMin, xMax, y);
          if (x !== null) { melhor = { x, y, rot, p, baixo: y + p.ultima + 1 }; break; }
        }
      }
      if (!melhor) { fora.push(n.id); continue; }
      filme.ocupar(melhor.p, melhor.x, melhor.y);
      pos[n.id] = { x: melhor.x * CELULA, y: melhor.y * CELULA, rot: melhor.rot };
      fundo = Math.max(fundo, melhor.baixo * CELULA);
      soma += melhor.baixo * 4096 + melhor.x;
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
  // Assinatura de uma montagem (posição e giro de cada peça), para reconhecer a mesma montagem
  function assinatura(pos) {
    return Object.keys(pos).sort().map((k) => k + ':' + Math.round(pos[k].x) + ',' + Math.round(pos[k].y) + ',' + pos[k].rot).join(';');
  }

  // semente: muda o sorteio (botão "Outra montagem"); evitar: assinatura da montagem que não serve
  // (a que já está na tela), para sempre devolver um arranjo diferente
  function encaixar({ largura, espaco = 5, girar = true, novas, limiteMs = 700, aoMelhorar, semente: outra = 0, evitar = null }) {
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
      if (evitar && assinatura(r.pos) === evitar) { semMelhora++; return; } // é a montagem que já está na tela
      // menos peças de fora; depois filme mais curto; empatando, tudo mais em cima e junto
      // (o espaço que sobra fica contínuo embaixo e do lado)
      const melhorou = !melhor || r.fora.length < melhor.fora.length || (r.fora.length === melhor.fora.length &&
        (r.fundo < melhor.fundo || (r.fundo === melhor.fundo && r.soma < melhor.soma)));
      if (melhorou) { melhor = r; semMelhora = 0; if (aoMelhorar) aoMelhorar(melhor); }
      else semMelhora++;
    };
    // a busca usa 80% do tempo; o resto fica para a passada de tapar buracos no fim
    const acabou = () => agora() - inicio > limiteMs * 0.8;
    if (outra) {
      let k = outra >>> 0;
      for (let i = tentativas.length - 1; i > 0; i--) { k = (Math.imul(k, 1103515245) + 12345) >>> 0; const j = k % (i + 1); [tentativas[i], tentativas[j]] = [tentativas[j], tentativas[i]]; }
    }
    for (const [ordem, giro, criterio] of tentativas) {
      if (feitas >= 3 && acabou()) break;
      if (!girar && giro !== 'livre') continue;
      guardar(rodada(largura, espaco, girar, ordem, { giro, criterio }));
    }

    let semente = (20261112 + lista.length * 7919 + outra * 104729) >>> 0;
    const sorte = () => ((semente = (Math.imul(semente, 1103515245) + 12345) >>> 0) / 4294967296);
    // artes que podem ficar tanto em pé quanto deitadas (as outras não têm escolha)
    const formas = [...new Set(lista.filter((n) => girar && !n.fixo && largDesenho(n.perfis[0]) <= Math.floor(largura / CELULA) &&
      largDesenho(n.perfis[90]) <= Math.floor(largura / CELULA)).map((n) => n.forma || n.id))];

    const giroDaForma = new Map(lista.map((n) => [n.forma || n.id, giros(n)]));
    // 1) As artes grandes é que decidem o tamanho da folha: testa TODAS as combinações de em pé /
    //    deitada das 8 maiores (as pequenas ficam livres para tapar os buracos), em duas ordens e com
    //    as duas regras de posição principais. Assim a combinação que alguém acharia girando à mão
    //    sempre entra na conta, mesmo com muitas artes na fila.
    const areaDaForma = new Map();
    for (const n of lista) { const f = n.forma || n.id; areaDaForma.set(f, Math.max(areaDaForma.get(f) || 0, n.w * n.h)); }
    const grandes = formas.filter((f) => areaDaForma.get(f) >= 100 * 100) // a partir de ~10 x 10 cm
      .sort((a, b) => areaDaForma.get(b) - areaDaForma.get(a)).slice(0, 8);
    if (grandes.length) {
      // no máximo um terço do tempo aqui (o resto fica para a busca local, que refina a melhor);
      // começa pelas combinações mais prováveis: todas iguais, depois uma diferente, duas diferentes...
      const k = grandes.length, total = 1 << k, prazoGiros = inicio + limiteMs * 0.33;
      const conta = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
      const mascaras = [...Array(total).keys()].sort((x, y) => Math.min(conta(x), k - conta(x)) - Math.min(conta(y), k - conta(y)) || x - y);
      for (const [ordem, criterio] of [[porArea, 'fundo'], [porMaior, 'fundo'], [porArea, 'topo']]) {
        for (const m of mascaras) {
          if (agora() > prazoGiros) break;
          const porForma = new Map(grandes.map((f, i) => [f, (m >> i) & 1 ? 'deitado' : 'pe']));
          guardar(rodada(largura, espaco, girar, ordem, { giro: 'livre', criterio, porForma }));
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
      for (const f of formas) { const ops = giroDaForma.get(f) || [0, 90]; porForma.set(f, sorte() < 0.4 ? 'livre' : ops[Math.floor(sorte() * ops.length)]); }
      return { ordem, jeito: sorte() < 0.5 ? { giro: 'livre', criterio: qual(), porForma } : { giro: 'livre', criterioDaPeca: qual, porForma } };
    };
    // se nenhuma montagem diferente apareceu até aqui, parte de um sorteio
    if (!melhor) guardar(rodada(largura, espaco, girar, [...lista].sort(() => sorte() - 0.5), { giro: 'livre', criterio: 'fundo' }));
    let atual = melhor || rodada(largura, espaco, girar, lista, { giro: 'livre', criterio: 'fundo' });
    let parado = 0; // passos sem a montagem atual melhorar
    while (!acabou() && semMelhora < 1500) {
      let receita;
      if (sorte() < (outra ? 0.3 : 0.15) || !atual.receita) receita = sortear();
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
          const f = formas[Math.floor(sorte() * formas.length)];
          const ops = [...(giroDaForma.get(f) || [0, 90]), 'livre', 'pe', 'deitado'];
          jeito.porForma.set(f, ops[Math.floor(sorte() * ops.length)]);
        } else { delete jeito.criterioDaPeca; jeito.criterio = qual(); }
        receita = { ordem, jeito };
      }
      const r = rodada(largura, espaco, girar, receita.ordem, receita.jeito);
      guardar(r);
      if (evitar && assinatura(r.pos) === evitar) continue;
      const naoPiorou = r.fora.length < atual.fora.length || (r.fora.length === atual.fora.length && (r.fundo < atual.fundo || (r.fundo === atual.fundo && r.soma <= atual.soma)));
      if (naoPiorou) { if (r.fundo < atual.fundo) parado = 0; else parado++; atual = r; }
      else { parado++; if (sorte() < 0.03) atual = melhor; } // volta para a melhor de todas de vez em quando
      // empacou: recomeça de um sorteio novo (mesmo pior), para não ficar preso no mesmo caminho
      if (parado > 60) { const nova = sortear(); atual = rodada(largura, espaco, girar, nova.ordem, nova.jeito); guardar(atual); parado = 0; }
    }
    if (!melhor) melhor = atual; // (só acontece se todas as tentativas deram a mesma montagem a evitar)
    // tapa buracos na melhor montagem (e também na segunda volta, se ainda houver tempo)
    const compacta = compactar(largura, espaco, girar, lista, melhor, inicio + Math.max(limiteMs, 50), agora);
    if (compacta !== melhor && (!evitar || assinatura(compacta.pos) !== evitar) &&
      (compacta.fundo < melhor.fundo || (compacta.fundo === melhor.fundo && compacta.soma < melhor.soma))) {
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

  const Encaixe = { encaixar, acrescentar, assinatura, sobrepoe, perfilRetangulo, limites, CELULA };
  if (typeof module === 'object' && module.exports) module.exports = Encaixe;
  else raiz.Encaixe = Encaixe;
})(typeof self !== 'undefined' ? self : this);
