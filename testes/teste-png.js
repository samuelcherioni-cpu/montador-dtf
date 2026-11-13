// node testes/teste-png.js — gera PNGs em faixas e confere: assinatura, CRC, tamanho, 300 DPI e os pixels de volta.
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { gerarPNG, lerDPI, crc } = require('../site/png.js');

function comprimirNoNode() {
  const d = zlib.createDeflate({ level: 6 });
  const saida = [];
  d.on('data', (c) => saida.push(new Uint8Array(c)));
  return {
    escrever: (u8) => new Promise((ok) => { if (d.write(u8)) ok(); else d.once('drain', ok); }),
    fechar: () => new Promise((ok) => { d.once('end', () => ok(saida)); d.end(); }),
  };
}

function ler(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.deepStrictEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'assinatura');
  const blocos = [];
  let i = 8;
  while (i < bytes.length) {
    const tam = v.getUint32(i);
    const tipo = bytes.subarray(i + 4, i + 8);
    const dados = bytes.subarray(i + 8, i + 8 + tam);
    assert.strictEqual(v.getUint32(i + 8 + tam), crc([tipo, dados]), 'CRC do bloco');
    blocos.push({ tipo: Buffer.from(tipo).toString(), dados });
    i += 12 + tam;
  }
  return blocos;
}

function juntar(partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const u = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { u.set(p, o); o += p.length; }
  return u;
}

// pixel de teste: cor que depende da posição, com partes transparentes
const cor = (x, y) => [(x * 7) & 255, (y * 3) & 255, (x + y) & 255, (x + y) % 5 === 0 ? 0 : 255];

(async () => {
  // 1) pequeno, conferindo pixel a pixel
  const L = 37, A = 53;
  const partes = await gerarPNG({
    largura: L, altura: A, alturaFaixa: 8, comprimir: comprimirNoNode,
    faixa: async (y0, n) => {
      const px = new Uint8ClampedArray(L * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < L; x++) px.set(cor(x, y0 + y), (y * L + x) * 4);
      return px;
    },
  });
  const bytes = juntar(partes);
  const blocos = ler(bytes);
  assert.deepStrictEqual(blocos.map((b) => b.tipo).filter((t, i, a) => a.indexOf(t) === i), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const ih = new DataView(blocos[0].dados.buffer, blocos[0].dados.byteOffset);
  assert.strictEqual(ih.getUint32(0), L);
  assert.strictEqual(ih.getUint32(4), A);
  assert.strictEqual(Math.round(lerDPI(bytes)), 300);
  const cru = zlib.inflateSync(Buffer.concat(blocos.filter((b) => b.tipo === 'IDAT').map((b) => Buffer.from(b.dados))));
  const linha = L * 4;
  let acima = new Uint8Array(linha);
  for (let y = 0; y < A; y++) {
    assert.strictEqual(cru[y * (linha + 1)], 2, 'filtro Up');
    const atual = new Uint8Array(linha);
    for (let i = 0; i < linha; i++) atual[i] = (cru[y * (linha + 1) + 1 + i] + acima[i]) & 255;
    for (let x = 0; x < L; x++) assert.deepStrictEqual([...atual.subarray(x * 4, x * 4 + 4)], cor(x, y), `pixel ${x},${y}`);
    acima = atual;
  }
  console.log('ok   PNG pequeno: blocos, CRC, 300 DPI e pixels conferem');

  // 2) filme de 3 m na largura real (6732 × 35433 px), quase todo transparente
  const LG = 6732, AG = Math.round(3000 / 25.4 * 300);
  const inicio = Date.now();
  const grandes = await gerarPNG({
    largura: LG, altura: AG, alturaFaixa: 512, comprimir: comprimirNoNode,
    faixa: async (y0, n) => {
      const px = new Uint8ClampedArray(LG * n * 4);
      for (let y = 0; y < n; y++) if ((y0 + y) % 1000 < 400) px.fill(200, (y * LG + 100) * 4, (y * LG + 3000) * 4);
      return px;
    },
  });
  const g = juntar(grandes);
  const bg = ler(g);
  const dv = new DataView(bg[0].dados.buffer, bg[0].dados.byteOffset);
  assert.strictEqual(dv.getUint32(0), LG);
  assert.strictEqual(dv.getUint32(4), AG);
  const arq = path.join(os.tmpdir(), 'fila-dtf-teste-3m.png');
  fs.writeFileSync(arq, g);
  console.log(`ok   filme de 3 m: ${LG} × ${AG} px, ${(g.length / 1e6).toFixed(1)} MB, ${((Date.now() - inicio) / 1000).toFixed(1)} s (${arq})`);
  // DPI de um JPG (cabeçalho JFIF): 300 por polegada, 118 por cm (= 299,7) e sem unidade
  const jfif = (unidade, x) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, unidade, x >> 8, x & 255, x >> 8, x & 255, 0, 0, 0xff, 0xda, 0, 2]);
  assert.strictEqual(lerDPI(jfif(1, 300)), 300);
  assert.strictEqual(Math.round(lerDPI(jfif(2, 118))), 300);
  assert.strictEqual(lerDPI(jfif(0, 1)), null);
  console.log('ok   DPI de JPG (JFIF)');
  console.log('png: tudo certo');
})().catch((e) => { console.log('FALHA ' + e.message); process.exit(1); });
