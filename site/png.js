// Gravador de PNG em faixas: monta um PNG RGBA de qualquer comprimento sem precisar de um canvas gigante.
// Cada faixa de linhas é pedida a quem chama, filtrada ("Up") e enviada ao compressor aos poucos.
(function (raiz) {
  'use strict';

  const TABELA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc(partes) {
    let c = 0xffffffff;
    for (const p of partes) for (let i = 0; i < p.length; i++) c = TABELA[(c ^ p[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function bloco(tipo, dados) {
    const t = new Uint8Array([tipo.charCodeAt(0), tipo.charCodeAt(1), tipo.charCodeAt(2), tipo.charCodeAt(3)]);
    const saida = new Uint8Array(12 + dados.length);
    const v = new DataView(saida.buffer);
    v.setUint32(0, dados.length);
    saida.set(t, 4);
    saida.set(dados, 8);
    v.setUint32(8 + dados.length, crc([t, dados]));
    return saida;
  }

  // Compressor do navegador (zlib, que é o formato que o PNG pede)
  function comprimirNoNavegador() {
    const cs = new CompressionStream('deflate');
    const escritor = cs.writable.getWriter();
    const saida = [];
    const lendo = (async () => {
      const leitor = cs.readable.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        saida.push(value);
      }
    })();
    return {
      escrever: (u8) => escritor.write(u8),
      fechar: async () => { await escritor.close(); await lendo; return saida; },
    };
  }

  // largura, altura em pixels; faixa(y0, linhas) devolve os pixels RGBA dessas linhas
  async function gerarPNG({ largura, altura, dpi = 300, faixa, alturaFaixa = 512, comprimir = comprimirNoNavegador, aoProgresso }) {
    const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];

    const ihdr = new Uint8Array(13);
    const vi = new DataView(ihdr.buffer);
    vi.setUint32(0, largura);
    vi.setUint32(4, altura);
    ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
    partes.push(bloco('IHDR', ihdr));

    const phys = new Uint8Array(9);
    const vp = new DataView(phys.buffer);
    const ppm = Math.round(dpi / 0.0254);
    vp.setUint32(0, ppm);
    vp.setUint32(4, ppm);
    phys[8] = 1; // pixels por metro
    partes.push(bloco('pHYs', phys));

    const z = comprimir();
    const porLinha = largura * 4;
    let anterior = new Uint8Array(porLinha);
    for (let y0 = 0; y0 < altura; y0 += alturaFaixa) {
      const linhas = Math.min(alturaFaixa, altura - y0);
      const px = await faixa(y0, linhas);
      const buf = new Uint8Array(linhas * (porLinha + 1));
      for (let l = 0; l < linhas; l++) {
        const o = l * (porLinha + 1), base = l * porLinha;
        buf[o] = 2; // filtro "Up": diferença para a linha de cima
        for (let i = 0; i < porLinha; i++) buf[o + 1 + i] = (px[base + i] - anterior[i]) & 0xff;
        anterior = px.subarray(base, base + porLinha);
      }
      anterior = Uint8Array.from(anterior);
      await z.escrever(buf);
      if (aoProgresso) aoProgresso(Math.min(1, (y0 + linhas) / altura));
    }
    for (const parte of await z.fechar()) partes.push(bloco('IDAT', parte));
    partes.push(bloco('IEND', new Uint8Array(0)));
    return partes;
  }

  // Lê o DPI gravado num PNG (bloco pHYs); devolve null se não houver
  function lerDPI(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 8;
    while (i + 8 <= bytes.length) {
      const tam = v.getUint32(i);
      const tipo = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (tipo === 'pHYs' && tam >= 9 && bytes[i + 16] === 1) return v.getUint32(i + 8) * 0.0254;
      if (tipo === 'IDAT' || tipo === 'IEND') return null;
      i += 12 + tam;
    }
    return null;
  }

  const Png = { gerarPNG, lerDPI, crc };
  if (typeof module === 'object' && module.exports) module.exports = Png;
  else raiz.Png = Png;
})(typeof self !== 'undefined' ? self : this);
