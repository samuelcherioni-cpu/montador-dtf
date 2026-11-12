// Cenários sorteados para medir o encaixe: formas variadas, tamanhos de 3 a 56 cm, de 1 a 100 cópias.
// Cada forma é desenhada numa grade de 1 mm (1 = tem desenho) e vira o mesmo "perfil" que a tela gera
// a partir do PNG: em cada linha, todos os trechos com desenho (buracos de até 3 mm contam como cheios).
'use strict';

const LARGURA_UTIL = 568;
const SO_DOIS_GIROS = process.env.SO_DOIS_GIROS === '1'; // para comparar com a versão de 2 giros // 57 cm menos 1 mm de cada lado
const ESPACO = 5;

function sorteador(semente) {
  let s = semente >>> 0 || 1;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  r.entre = (a, b) => a + r() * (b - a);
  r.inteiro = (a, b) => Math.floor(r.entre(a, b + 1));
  r.um = (lista) => lista[Math.floor(r() * lista.length)];
  return r;
}

// ---------- formas (grade de cols x linhas, 1 mm por célula) ----------
function grade(cols, linhas) { return { cols, linhas, g: new Uint8Array(cols * linhas) }; }
function pintar(G, f) {
  for (let y = 0; y < G.linhas; y++) for (let x = 0; x < G.cols; x++) if (f((x + 0.5) / G.cols, (y + 0.5) / G.linhas, x, y)) G.g[y * G.cols + x] = 1;
  return G;
}
const FORMAS = {
  retangulo: () => () => true,
  elipse: () => (u, v) => (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25,
  triangulo: () => (u, v) => Math.abs(u - 0.5) <= v / 2,
  diagonal: () => (u, v) => u >= v * 0.4 && u <= 0.6 + v * 0.4,
  L: (r) => { const a = r.entre(0.25, 0.5), b = r.entre(0.25, 0.5); return (u, v) => u <= a || v >= 1 - b; },
  U: (r) => { const a = r.entre(0.15, 0.3), b = r.entre(0.15, 0.3); return (u, v) => u <= a || u >= 1 - a || v >= 1 - b; },
  anel: (r) => { const e = r.entre(0.12, 0.25); return (u, v) => { const d = (u - 0.5) ** 2 + (v - 0.5) ** 2; return d <= 0.25 && d >= (0.5 - e) ** 2; }; },
  // texto: letras (blocos) com vão entre elas, em 1 a 3 linhas
  texto: (r) => {
    const linhasTxt = r.inteiro(1, 3), letras = r.inteiro(4, 12), vao = r.entre(0.15, 0.35);
    return (u, v) => {
      const lt = v * linhasTxt, fl = lt - Math.floor(lt);
      if (fl > 0.8) return false; // espaço entre linhas
      const pl = u * letras, fu = pl - Math.floor(pl);
      return fu > vao / 2 && fu < 1 - vao / 2;
    };
  },
  // retrato: faixa de logo no alto com raios descendo nas laterais, cabeça e ombros
  retrato: () => (u, v) => {
    if (v < 0.12) return u > 0.08 && u < 0.92;
    if (v < 0.3 && (u < 0.12 - (v - 0.12) * 0.6 + 0.02 && u > 0.12 - (v - 0.12) * 0.6 - 0.04)) return true;
    if (v < 0.3 && (u > 0.88 + (v - 0.12) * 0.6 - 0.02 && u < 0.88 + (v - 0.12) * 0.6 + 0.04)) return true;
    if ((u - 0.5) ** 2 / 0.06 + (v - 0.42) ** 2 / 0.04 <= 1) return true;
    return v > 0.6 && Math.abs(u - 0.5) <= 0.25 + (v - 0.6) * 0.6;
  },
  // logo com raios: barra no meio e raios descendo e subindo nas pontas
  logoRaios: () => (u, v) => (v > 0.25 && v < 0.65 && u > 0.08 && u < 0.92) || (u < 0.12 && v > 0.4 && u > (v - 0.4) * 0.15) || (u > 0.85 && v < 0.6 && u < 0.85 + (0.6 - v) * 0.25),
  // silhueta irregular com borda pontilhada, como um personagem em halftone
  mancha: (r) => {
    const f = [r.entre(0, 6), r.entre(0, 6), r.entre(0, 6)], amp = [r.entre(0.04, 0.12), r.entre(0.03, 0.09), r.entre(0.02, 0.06)];
    const cx = r.entre(0.42, 0.58), cy = r.entre(0.42, 0.58);
    return (u, v, x, y) => {
      const a = Math.atan2(v - cy, u - cx), d = Math.hypot((u - cx) / 0.5, (v - cy) / 0.5);
      const borda = 0.78 + amp[0] * Math.sin(3 * a + f[0]) + amp[1] * Math.sin(7 * a + f[1]) + amp[2] * Math.sin(13 * a + f[2]);
      if (d <= borda * 0.9) return true;
      // faixa de pontos (halftone) perto da borda
      return d <= borda * 1.08 && ((x % 4) < 2) && ((y % 4) < 2);
    };
  },
  // polígono aleatório com pontas e reentrâncias (de 5 a 12 vértices, raio sorteado em cada um)
  poligono: (r) => {
    const n = r.inteiro(5, 12), raios = [], angs = [];
    for (let i = 0; i < n; i++) { angs.push((i / n) * Math.PI * 2 + r.entre(-0.25, 0.25)); raios.push(r.entre(0.25, 0.5)); }
    return (u, v) => {
      const a = Math.atan2(v - 0.5, u - 0.5), d = Math.hypot(u - 0.5, v - 0.5);
      let k = 0; const aa = (a + Math.PI * 2) % (Math.PI * 2);
      while (k < n - 1 && angs[k + 1] % (Math.PI * 2) < aa) k++;
      const a0 = angs[k], a1 = k + 1 < n ? angs[k + 1] : angs[0] + Math.PI * 2;
      const f = Math.min(1, Math.max(0, (aa - a0) / (a1 - a0 || 1)));
      return d <= raios[k] * (1 - f) + raios[(k + 1) % n] * f;
    };
  },
  // recorte em blocos: retângulos de tamanhos sorteados juntos (montagem de estampa)
  blocos: (r) => {
    const q = r.inteiro(2, 6), b = [];
    for (let i = 0; i < q; i++) { const x0 = r.entre(0, 0.7), y0 = r.entre(0, 0.7); b.push([x0, y0, x0 + r.entre(0.15, 1 - x0), y0 + r.entre(0.15, 1 - y0)]); }
    return (u, v) => b.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1);
  },
  estrela: () => (u, v) => {
    const x = u - 0.5, y = v - 0.5, a = Math.atan2(y, x), rr = Math.hypot(x, y);
    return rr <= 0.5 * (0.55 + 0.45 * Math.abs(Math.cos(2.5 * a)));
  },
};

// Halftone em qualquer formato: numa faixa de até 1,2 cm junto da borda, o desenho vira pontilhado,
// com pontos cada vez menores e mais espaçados para fora (como o degradê de um halftone de verdade).
function comHalftone(G, faixa) {
  const { cols, linhas, g } = G;
  // distância (em mm, aproximada) de cada pixel com desenho até o vazio mais próximo, pelas 4 direções
  const dist = new Uint16Array(cols * linhas).fill(65535);
  for (let y = 0; y < linhas; y++) {
    let d = 0; for (let x = 0; x < cols; x++) { d = g[y * cols + x] ? d + 1 : 0; dist[y * cols + x] = Math.min(dist[y * cols + x], d); }
    d = 0; for (let x = cols - 1; x >= 0; x--) { d = g[y * cols + x] ? d + 1 : 0; dist[y * cols + x] = Math.min(dist[y * cols + x], d); }
  }
  for (let x = 0; x < cols; x++) {
    let d = 0; for (let y = 0; y < linhas; y++) { d = g[y * cols + x] ? d + 1 : 0; dist[y * cols + x] = Math.min(dist[y * cols + x], d); }
    d = 0; for (let y = linhas - 1; y >= 0; y--) { d = g[y * cols + x] ? d + 1 : 0; dist[y * cols + x] = Math.min(dist[y * cols + x], d); }
  }
  for (let y = 0; y < linhas; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x; if (!g[i] || dist[i] > faixa) continue;
    const passo = 2 + Math.round((1 - dist[i] / faixa) * 3); // pontos mais espaçados perto da borda
    if (x % passo !== 0 || y % passo !== 0) g[i] = 0;
  }
  return G;
}

// margem transparente em volta (muitos PNGs vêm com sobra)
function comMargem(G, m) {
  if (!m) return G;
  const N = grade(G.cols + 2 * m, G.linhas + 2 * m);
  for (let y = 0; y < G.linhas; y++) for (let x = 0; x < G.cols; x++) N.g[(y + m) * N.cols + x + m] = G.g[y * G.cols + x];
  return N;
}

function girar90(G) { // horário, como na tela
  const N = grade(G.linhas, G.cols);
  for (let y = 0; y < G.linhas; y++) for (let x = 0; x < G.cols; x++) if (G.g[y * G.cols + x]) N.g[x * N.cols + (G.linhas - 1 - y)] = 1;
  return N;
}

function perfil(G) {
  const spans = new Array(G.linhas);
  let area = 0;
  for (let y = 0; y < G.linhas; y++) {
    const t = [];
    let x = 0;
    while (x < G.cols) {
      while (x < G.cols && !G.g[y * G.cols + x]) x++;
      if (x >= G.cols) break;
      const a0 = x;
      while (x < G.cols && G.g[y * G.cols + x]) x++;
      area += x - a0;
      if (t.length && a0 - t[t.length - 1] <= 3) t[t.length - 1] = x; else t.push(a0, x);
    }
    spans[y] = t;
  }
  return { cols: G.cols, linhas: G.linhas, spans, area };
}

// Área do desenho engordado em r mm para todos os lados. Com espaço de 5 mm entre artes, as artes
// engordadas em 2 mm nunca se sobrepõem, então a soma dessas áreas é um mínimo de filme honesto.
function areaEngordada(G, r) {
  const { cols, linhas, g } = G;
  const horiz = new Uint8Array(cols * linhas);
  for (let y = 0; y < linhas; y++) {
    // varre dos dois lados para marcar quem tem desenho a até r colunas
    let prox = -1e9;
    for (let x = 0; x < cols; x++) { if (g[y * cols + x]) prox = x; if (x - prox <= r) horiz[y * cols + x] = 1; }
    prox = 1e9;
    for (let x = cols - 1; x >= 0; x--) { if (g[y * cols + x]) prox = x; if (prox - x <= r) horiz[y * cols + x] = 1; }
  }
  let area = 0;
  for (let x = 0; x < cols; x++) {
    let prox = -1e9;
    const col = new Uint8Array(linhas);
    for (let y = 0; y < linhas; y++) { if (horiz[y * cols + x]) prox = y; if (y - prox <= r) col[y] = 1; }
    prox = 1e9;
    for (let y = linhas - 1; y >= 0; y--) { if (horiz[y * cols + x]) prox = y; if (prox - y <= r) col[y] = 1; }
    for (let y = 0; y < linhas; y++) area += col[y];
  }
  return area;
}

let HALFTONE_AS_VEZES = false; // ligado no conjunto real
function arte(r, tipo, wcm, hcm, comHT) {
  const cols = Math.max(10, Math.round(wcm * 10)), linhas = Math.max(10, Math.round(hcm * 10));
  let G = pintar(grade(cols, linhas), FORMAS[tipo](r));
  if (comHT === true || (comHT === undefined && HALFTONE_AS_VEZES && r() < 0.5)) { G = comHalftone(G, r.inteiro(4, 12)); tipo += '+halftone'; }
  const m = r() < 0.35 ? r.inteiro(2, 25) : 0; // até 2,5 cm de sobra transparente
  G = comMargem(G, m);
  if (G.cols > LARGURA_UTIL && G.linhas > LARGURA_UTIL) return null;
  const G90 = girar90(G), G180 = girar90(G90), G270 = girar90(G180);
  const p0 = perfil(G), p90 = perfil(G90);
  const quatro = { 0: p0, 90: p90, 180: perfil(G180), 270: perfil(G270) };
  const linhasCom = p0.spans.map((t, y) => (t.length ? y : -1)).filter((y) => y >= 0);
  let esq = 1e9, dir = 0; for (const t of p0.spans) if (t.length) { esq = Math.min(esq, t[0]); dir = Math.max(dir, t[t.length - 1]); }
  return { tipo, w: G.cols, h: G.linhas, dw: dir - esq, dh: linhasCom[linhasCom.length - 1] - linhasCom[0] + 1, area: p0.area, areaComEspaco: areaEngordada(G, 2), perfis: SO_DOIS_GIROS ? { 0: p0, 90: p90 } : quatro };
}

// ---------- tipos de fila ----------
const TIPOS_FILA = {
  'logos pequenos': (r) => lista(r, r.inteiro(3, 8), () => [r.entre(3, 10), r.entre(3, 10)], () => r.inteiro(5, 40)),
  'mistos': (r) => lista(r, r.inteiro(4, 10), () => [r.entre(5, 40), r.entre(5, 40)], () => r.inteiro(1, 8)),
  'grandes + pequenos': (r) => [
    ...lista(r, r.inteiro(1, 4), () => [r.entre(20, 35), r.entre(20, 38)], () => r.inteiro(1, 4)),
    ...lista(r, r.inteiro(2, 5), () => [r.entre(3, 10), r.entre(3, 10)], () => r.inteiro(3, 20)),
  ],
  'uma arte, muitas cópias': (r) => lista(r, 1, () => [r.entre(5, 30), r.entre(5, 30)], () => r.inteiro(20, 100)),
  'artes largas': (r) => [
    ...lista(r, r.inteiro(1, 4), () => [r.entre(30, 56), r.entre(5, 15)], () => r.inteiro(1, 6), ['retangulo', 'texto', 'logoRaios', 'diagonal']),
    ...lista(r, r.inteiro(0, 3), () => [r.entre(4, 12), r.entre(4, 12)], () => r.inteiro(1, 10)),
  ],
  'formas irregulares': (r) => lista(r, r.inteiro(2, 6), () => [r.entre(12, 32), r.entre(12, 32)], () => r.inteiro(1, 6), ['retrato', 'anel', 'U', 'L', 'triangulo', 'estrela', 'logoRaios', 'diagonal']),
  'texto': (r) => lista(r, r.inteiro(2, 6), () => [r.entre(10, 50), r.entre(3, 12)], () => r.inteiro(1, 10), ['texto', 'logoRaios']),
  'poucas artes grandes': (r) => lista(r, r.inteiro(3, 8), () => [r.entre(22, 40), r.entre(25, 42)], () => r.inteiro(1, 2), ['mancha', 'retrato', 'mancha', 'retangulo', 'elipse', 'logoRaios']),
  'fila longa': (r) => lista(r, r.inteiro(5, 12), () => [r.entre(5, 30), r.entre(5, 30)], () => r.inteiro(4, 25)),
};
const NOMES_FORMAS = Object.keys(FORMAS);

// Conjunto "real": como as filas da Zavari & Vantti. Nenhuma arte passa de 37 cm (nem de altura nem
// de largura). Inclui a fila com uma arte pequena adicionada por último.
const MAX = 37;
const grande = (r) => () => [r.entre(22, MAX), r.entre(25, MAX)];
const media = (r) => () => [r.entre(10, 25), r.entre(10, 25)];
const pequena = (r) => () => [r.entre(3, 10), r.entre(3, 10)];
const FORMAS_ESTAMPA = ['mancha', 'mancha', 'retrato', 'retrato', 'retangulo', 'elipse', 'logoRaios', 'texto', 'estrela', 'U', 'anel', 'triangulo', 'L', 'diagonal', 'poligono', 'poligono', 'blocos', 'blocos'];
// tamanho realmente aleatório: proporções de faixa fina e comprida até quase quadrado, sempre até 37 cm
const qualquer = (r) => () => { const t = r(); if (t < 0.2) return r() < 0.5 ? [r.entre(3, 8), r.entre(20, MAX)] : [r.entre(20, MAX), r.entre(3, 8)]; const a = r.entre(3, MAX); return [a, Math.min(MAX, Math.max(3, a * r.entre(0.4, 2.5)))]; };
const TIPOS_REAL = {
  'formatos variados': (r) => lista(r, r.inteiro(4, 14), qualquer(r), () => r.inteiro(1, 12), ['poligono', 'blocos', 'L', 'U', 'triangulo', 'diagonal', 'texto', 'retangulo', 'estrela', 'logoRaios', 'retrato', 'mancha']),
  'muitas grandes': (r) => lista(r, r.inteiro(3, 10), grande(r), () => r.inteiro(2, 8), FORMAS_ESTAMPA),
  'muitas pequenas': (r) => lista(r, r.inteiro(5, 15), pequena(r), () => r.inteiro(10, 30), FORMAS_ESTAMPA),
  'metade de cada': (r) => [
    ...lista(r, r.inteiro(2, 6), grande(r), () => r.inteiro(1, 5), FORMAS_ESTAMPA),
    ...lista(r, r.inteiro(3, 8), pequena(r), () => r.inteiro(5, 20), FORMAS_ESTAMPA),
  ],
  'médias': (r) => lista(r, r.inteiro(4, 10), media(r), () => r.inteiro(2, 10), FORMAS_ESTAMPA),
  'poucas grandes': (r) => lista(r, r.inteiro(3, 8), grande(r), () => r.inteiro(1, 2), FORMAS_ESTAMPA),
  // halftone em todo tipo de formato (não só redondo)
  'halftone': (r) => lista(r, r.inteiro(2, 8), qualquer(r), () => r.inteiro(1, 6), FORMAS_ESTAMPA, true),
  'tudo misturado': (r) => [
    ...lista(r, r.inteiro(1, 5), grande(r), () => r.inteiro(1, 6), FORMAS_ESTAMPA),
    ...lista(r, r.inteiro(1, 6), media(r), () => r.inteiro(1, 8), FORMAS_ESTAMPA),
    ...lista(r, r.inteiro(1, 6), pequena(r), () => r.inteiro(1, 25), FORMAS_ESTAMPA),
  ],
  // uma fila qualquer e, no fim, uma arte pequena: ela tem que achar um buraco sem aumentar a folha
  'pequena por último': (r) => {
    const base = r.um([
      () => lista(r, r.inteiro(2, 6), grande(r), () => r.inteiro(1, 4), FORMAS_ESTAMPA),
      () => lista(r, r.inteiro(3, 8), media(r), () => r.inteiro(1, 6), FORMAS_ESTAMPA),
      () => [...lista(r, r.inteiro(1, 4), grande(r), () => r.inteiro(1, 3), FORMAS_ESTAMPA), ...lista(r, r.inteiro(1, 4), pequena(r), () => r.inteiro(2, 10), FORMAS_ESTAMPA)],
    ])();
    const ultima = lista(r, 1, () => [r.entre(3, 8), r.entre(3, 8)], () => 1, FORMAS_ESTAMPA);
    if (!base.length || !ultima.length) return [];
    ultima[0].ultimaPequena = true;
    return [...base, ...ultima];
  },
};
const CONJUNTOS = { geral: () => { HALFTONE_AS_VEZES = false; return TIPOS_FILA; }, real: () => { HALFTONE_AS_VEZES = true; return TIPOS_REAL; } };

function lista(r, tipos, tamanho, quantidade, formas = NOMES_FORMAS, comHT) {
  const saida = [];
  for (let i = 0; i < tipos; i++) {
    const [w, h] = tamanho();
    const a = arte(r, r.um(formas), w, h, comHT);
    if (a) saida.push({ ...a, qtd: quantidade() });
  }
  return saida;
}

// Um cenário só (o de número i): cada núcleo gera só os que vai medir, sem guardar todos na memória.
function gerarCenario(i, semente = 1, conjunto = 'geral') {
  const tipos = CONJUNTOS[conjunto]();
  const nomes = Object.keys(tipos);
  const tipo = nomes[i % nomes.length];
  for (let tentativa = 0; ; tentativa++) {
    const r = sorteador(semente * 100003 + i * 7919 + tentativa * 104729 + (conjunto === 'real' ? 55555 : 0));
    const artes = tipos[tipo](r);
    if (artes.length) return { id: i, tipo, artes };
  }
}
function gerarCenarios(n, semente = 1, conjunto = 'geral') {
  const cenarios = [];
  for (let i = 0; i < n; i++) cenarios.push(gerarCenario(i, semente, conjunto));
  return cenarios;
}

// peças no formato que o encaixe recebe
function pecasDo(c) {
  const novas = [];
  c.artes.forEach((a, k) => { for (let i = 0; i < a.qtd; i++) novas.push({ id: k + '-' + i, forma: 'f' + k, w: a.w, h: a.h, rot: 0, perfis: a.perfis }); });
  return novas;
}

function avaliar(Encaixe, c, opcoes = {}) {
  const novas = pecasDo(c);
  const t = Date.now();
  const r = Encaixe.encaixar({ largura: LARGURA_UTIL, espaco: ESPACO, novas, ...opcoes });
  const ms = Date.now() - t;
  // conferência: nenhuma peça fora da largura e nenhuma sobreposição (pelo formato real)
  const colocadas = novas.filter((n) => r.pos[n.id]);
  let erro = null;
  for (const n of colocadas) {
    const p = r.pos[n.id], lim = Encaixe.limites ? Encaixe.limites(n.perfis[p.rot]) : { esq: 0, dir: n.perfis[p.rot].cols, primeira: 0 };
    // só a parte desenhada precisa estar dentro do filme
    if (p.x + lim.esq < 0 || p.y + lim.primeira < 0 || p.x + lim.dir > LARGURA_UTIL) { erro = 'fora do filme: ' + n.id; break; }
  }
  if (!erro) {
    const caixas = colocadas.map((n) => { const p = r.pos[n.id], pf = n.perfis[p.rot]; return { n, p, pf }; });
    caixas.sort((a, b) => a.p.y - b.p.y);
    for (let i = 0; i < caixas.length && !erro; i++) {
      const A = caixas[i];
      for (let j = i + 1; j < caixas.length; j++) {
        const B = caixas[j];
        if (B.p.y >= A.p.y + A.pf.linhas) break;
        if (B.p.x >= A.p.x + A.pf.cols || A.p.x >= B.p.x + B.pf.cols) continue;
        if (Encaixe.sobrepoe(A.pf, A.p.x, A.p.y, B.pf, B.p.x, B.p.y)) { erro = 'sobreposição: ' + A.n.id + ' x ' + B.n.id; break; }
      }
    }
  }
  const area = c.artes.reduce((s, a) => s + a.area * a.qtd, 0);
  // mínimo de filme possível: área das artes engordadas em 2 mm (o espaço obrigatório entre elas)
  // dividida pela largura (+2 mm de cada lado, onde a engorda pode sobrar para fora)
  const areaEsp = c.artes.reduce((s, a) => s + a.areaComEspaco * a.qtd, 0);
  // (arte que o halftone deixou sem nenhum ponto não entra na conta do lado mínimo)
  const minimo = Math.max(areaEsp / (LARGURA_UTIL + 4), ...c.artes.filter((a) => a.dw > 0 && a.dh > 0).map((a) => Math.min(a.dw, a.dh)));
  // fila com uma pequena no fim: quanto a folha cresceu por causa dela (0 = achou um buraco)
  let aumentou = null;
  if (c.artes.some((a) => a.ultimaPequena)) {
    const sem = { ...c, artes: c.artes.filter((a) => !a.ultimaPequena) };
    const r0 = Encaixe.encaixar({ largura: LARGURA_UTIL, espaco: ESPACO, novas: pecasDo(sem), ...opcoes });
    let final = r.fundo;
    if (Encaixe.acrescentar) {
      // como a tela faz: a montagem que já existia + a pequena num buraco, contra remontar tudo
      const antes = pecasDo(sem), k = c.artes.findIndex((a) => a.ultimaPequena), a = c.artes[k];
      const nova = { id: k + '-0', forma: 'f' + k, w: a.w, h: a.h, rot: 0, perfis: a.perfis };
      const inc = Encaixe.acrescentar({ largura: LARGURA_UTIL, espaco: ESPACO, colocadas: antes.map((n) => ({ n, pos: r0.pos[n.id] })).filter((x) => x.pos), novas: [nova] });
      final = Math.min(final, inc.fundo);
    }
    aumentou = Math.max(0, final - r0.fundo);
  }
  return {
    id: c.id, tipo: c.tipo, pecas: novas.length, fora: r.fora.length, fundo: r.fundo, ms, erro, aumentou,
    aproveitamento: area / (LARGURA_UTIL * Math.max(1, r.fundo)), // parte desenhada / filme usado
    folga: r.fundo / minimo, // quantas vezes o mínimo teórico (1,00 = impossível fazer melhor)
  };
}

module.exports = { CONJUNTOS, gerarCenario, gerarCenarios, avaliar, pecasDo, TIPOS_FILA, LARGURA_UTIL, ESPACO };
