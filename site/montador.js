// Fila DTF: artes, encaixe no filme, visualização e geração do PNG. Tudo roda neste navegador.
(() => {
  'use strict';

  const FILME_MM = 570;               // largura do filme
  const DPI = 300;
  const PX_MM = DPI / 25.4;           // pixels por milímetro no arquivo final
  const FILME_PX = Math.round(FILME_MM * PX_MM);
  const IDENT_MM = 8;                 // faixa da identificação no fim do filme
  const DPI_MINIMO = 150;
  const MAX_METROS = 20;

  const $ = (id) => document.getElementById(id);
  const est = { artes: [], pecas: [], sel: new Set(), zoom: null, margem: 3, espaco: 5, girar: true, modo: 'auto', metros: 1, ident: '' };
  let seq = 0;

  const fmt = (n, c = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const cm = (mm) => fmt(mm / 10, 1);
  const metrosTxt = (mm) => fmt(mm / 1000, 2) + ' m';
  const larguraUtil = () => FILME_MM - 2 * est.margem;
  const arteDe = (id) => est.artes.find((a) => a.id === id);
  const medida = (p) => { const a = arteDe(p.arte); return p.rot ? { w: a.h, h: a.w } : { w: a.w, h: a.h }; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let avisoTempo = 0;
  function avisar(txt, erro) {
    const el = $('aviso');
    el.textContent = txt;
    el.className = 'aviso' + (erro ? ' erro' : '');
    el.hidden = false;
    clearTimeout(avisoTempo);
    avisoTempo = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // ---------- medidas do filme ----------
  function fundoPecas() {
    let f = 0;
    for (const p of est.pecas) f = Math.max(f, p.y + medida(p).h);
    return f;
  }
  function necessario() { // comprimento mínimo que a fila precisa
    const f = Math.max(fundoPecas(), est.margem);
    return f + (est.ident ? est.espaco + IDENT_MM : 0) + est.margem;
  }
  function comprimento() {
    if (est.modo === 'fixo') return Math.round(est.metros * 1000);
    return Math.max(100, Math.ceil(necessario() / 100 - 1e-9) * 100);
  }

  // ---------- encaixe ----------
  function encaixarPecas(pecas) {
    if (!pecas.length) return;
    const ids = new Set(pecas.map((p) => p.id));
    const fixas = est.pecas.filter((p) => !ids.has(p.id)).map((p) => {
      const m = medida(p);
      return { x: p.x - est.margem, y: p.y - est.margem, w: m.w, h: m.h };
    });
    const novas = pecas.map((p) => { const a = arteDe(p.arte); return { id: p.id, w: a.w, h: a.h, rot: p.rot }; });
    const r = Encaixe.encaixar({ largura: larguraUtil(), espaco: est.espaco, girar: est.girar, fixas, novas });
    for (const p of pecas) {
      const pos = r.pos[p.id];
      if (pos) { p.x = pos.x + est.margem; p.y = pos.y + est.margem; p.rot = pos.rot; }
    }
    if (r.fora.length) {
      const fora = new Set(r.fora);
      est.pecas = est.pecas.filter((p) => !fora.has(p.id));
      for (const a of est.artes) a.qtd = est.pecas.filter((p) => p.arte === a.id).length;
      avisar(`${r.fora.length} cópia(s) não cabem na largura do filme. Diminua a arte.`, true);
    }
  }
  function organizar() {
    for (const p of est.pecas) p.rot = arteDe(p.arte).rot;
    encaixarPecas(est.pecas);
    est.sel.clear();
    desenhar();
  }

  function novaPeca(arte) {
    const p = { id: 'p' + ++seq, arte: arte.id, x: 0, y: 0, rot: arte.rot };
    est.pecas.push(p);
    return p;
  }

  // ---------- artes ----------
  function cabe(w, h) {
    const u = larguraUtil();
    return est.girar ? Math.min(w, h) <= u + 1e-6 : w <= u + 1e-6;
  }

  async function adicionarArquivos(lista) {
    const arquivos = [...lista];
    const png = arquivos.filter((f) => f.type === 'image/png' || /\.png$/i.test(f.name));
    if (png.length < arquivos.length) avisar('Só arquivos PNG. Os outros foram ignorados.', true);
    const novas = [];
    for (const f of png) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const dpiArq = Png.lerDPI(bytes);
        const dpiUso = dpiArq && dpiArq >= 50 && dpiArq <= 2400 ? dpiArq : DPI;
        let w = (bitmap.width / dpiUso) * 25.4, h = (bitmap.height / dpiUso) * 25.4;
        const u = larguraUtil();
        if (w > u) { h = (h * u) / w; w = u; }
        const arte = {
          id: 'a' + ++seq, nome: f.name.replace(/\.png$/i, ''), bitmap, url: URL.createObjectURL(f),
          pxW: bitmap.width, pxH: bitmap.height, w: arred(w), h: arred(h), rot: 0, travado: true,
          transparente: temTransparencia(bitmap), qtd: 1,
        };
        est.artes.push(arte);
        novas.push(novaPeca(arte));
      } catch (e) {
        avisar(`Não foi possível abrir ${f.name}.`, true);
      }
    }
    encaixarPecas(novas);
    desenharLista();
    desenhar();
  }
  const arred = (mm) => Math.round(mm * 10) / 10;

  function temTransparencia(bitmap) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  function dpiEfetivo(a) { return a.pxW / (a.w / 25.4); }

  function mudarQtd(arte, qtd) {
    qtd = Math.max(1, Math.min(999, Math.round(qtd) || 1));
    const atuais = est.pecas.filter((p) => p.arte === arte.id);
    if (qtd > atuais.length) {
      const novas = [];
      for (let i = atuais.length; i < qtd; i++) novas.push(novaPeca(arte));
      encaixarPecas(novas);
    } else if (qtd < atuais.length) {
      const sai = new Set(atuais.slice(qtd).map((p) => p.id));
      est.pecas = est.pecas.filter((p) => !sai.has(p.id));
      sai.forEach((id) => est.sel.delete(id));
    }
    arte.qtd = est.pecas.filter((p) => p.arte === arte.id).length;
  }

  function mudarTamanho(arte, campo, valorCm) {
    const mm = valorCm * 10;
    if (!(mm >= 5)) { avisar('Medida mínima: 0,5 cm.', true); return false; }
    let w = arte.w, h = arte.h;
    if (campo === 'w') { if (arte.travado) h = (h * mm) / w; w = mm; } else { if (arte.travado) w = (w * mm) / h; h = mm; }
    if (!cabe(w, h)) { avisar(`Não cabe no filme: o lado menor pode ter até ${cm(larguraUtil())} cm.`, true); return false; }
    arte.w = arred(w); arte.h = arred(h);
    if (!est.girar && arte.rot === 0 && arte.w > larguraUtil()) arte.rot = 90;
    const pecas = est.pecas.filter((p) => p.arte === arte.id);
    pecas.forEach((p) => { p.rot = arte.rot; });
    encaixarPecas(pecas);
    return true;
  }

  function girarArte(arte) {
    const nova = arte.rot ? 0 : 90;
    const w = nova ? arte.h : arte.w;
    if (w > larguraUtil() + 1e-6) { avisar('Girada, a arte passa da largura do filme.', true); return; }
    arte.rot = nova;
    const pecas = est.pecas.filter((p) => p.arte === arte.id);
    pecas.forEach((p) => { p.rot = nova; });
    const girar = est.girar;
    est.girar = false; // respeita o giro escolhido
    encaixarPecas(pecas);
    est.girar = girar;
  }

  function removerArte(arte) {
    est.pecas = est.pecas.filter((p) => p.arte !== arte.id);
    est.artes = est.artes.filter((a) => a !== arte);
    URL.revokeObjectURL(arte.url);
    if (arte.bitmap.close) arte.bitmap.close();
  }

  // ---------- lista de artes ----------
  const ICONES = {
    menos: '<path d="M6 12h12"/>',
    mais: '<path d="M6 12h12M12 6v12"/>',
    girar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    fechado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    aberto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n]}</svg>`;

  function desenharLista() {
    const el = $('lista');
    if (!est.artes.length) {
      el.innerHTML = `<div class="vazio" id="vazio" role="button" tabindex="0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
        <b>Adicione PNGs com fundo transparente</b><span>Toque aqui ou solte os arquivos na tela</span></div>`;
      return;
    }
    const selArtes = new Set([...est.sel].map((id) => (est.pecas.find((p) => p.id === id) || {}).arte));
    el.innerHTML = est.artes.map((a) => {
      const dpi = dpiEfetivo(a);
      const selos = [];
      if (dpi < DPI_MINIMO) selos.push(`<span class="selo atencao">Resolução baixa · ${Math.round(dpi)} DPI</span>`);
      if (!a.transparente) selos.push('<span class="selo atencao">Sem fundo transparente</span>');
      return `<article class="arte glass brilho${selArtes.has(a.id) ? ' marcada' : ''}" data-arte="${a.id}">
        <div class="mini"><img src="${a.url}" alt=""></div>
        <div class="arte-info">
          <div class="arte-nome"><b title="${esc(a.nome)}">${esc(a.nome)}</b><span class="num">${a.pxW} × ${a.pxH} px</span></div>
          <div class="medidas">
            <input class="input curto num" data-campo="w" type="number" min="0.5" step="0.1" value="${fmtCampo(a.w)}" aria-label="Largura em cm">
            <small>×</small>
            <input class="input curto num" data-campo="h" type="number" min="0.5" step="0.1" value="${fmtCampo(a.h)}" aria-label="Altura em cm">
            <small>cm</small>
            <button class="btn btn-ghost btn-icone${a.travado ? ' ativo' : ''}" data-acao="travar" type="button" title="${a.travado ? 'Proporção travada' : 'Proporção livre'}" aria-label="Travar proporção">${svg(a.travado ? 'fechado' : 'aberto')}</button>
          </div>
          <div class="arte-linha">
            <div class="qtd">
              <small>Qtd.</small>
              <button class="btn btn-ghost btn-icone" data-acao="menos" type="button" aria-label="Uma cópia a menos">${svg('menos')}</button>
              <input class="input curto num" data-campo="qtd" type="number" min="1" max="999" step="1" value="${a.qtd}" aria-label="Quantidade">
              <button class="btn btn-ghost btn-icone" data-acao="mais" type="button" aria-label="Uma cópia a mais">${svg('mais')}</button>
            </div>
            <button class="btn btn-ghost btn-icone${a.rot ? ' ativo' : ''}" data-acao="girar" type="button" title="Girar 90°" aria-label="Girar 90°">${svg('girar')}</button>
            <button class="btn btn-ghost btn-icone perigo" data-acao="remover" type="button" title="Remover arte" aria-label="Remover arte">${svg('lixo')}</button>
          </div>
          ${selos.length ? `<div class="selos">${selos.join('')}</div>` : ''}
        </div>
      </article>`;
    }).join('');
  }
  const fmtCampo = (mm) => String(Math.round(mm) / 10);

  $('lista').addEventListener('click', (e) => {
    if (e.target.closest('#vazio')) { $('arquivos').click(); return; }
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const arte = arteDe(b.closest('[data-arte]').dataset.arte);
    if (!arte) return;
    const acao = b.dataset.acao;
    if (acao === 'mais') mudarQtd(arte, arte.qtd + 1);
    else if (acao === 'menos') mudarQtd(arte, arte.qtd - 1);
    else if (acao === 'girar') girarArte(arte);
    else if (acao === 'travar') arte.travado = !arte.travado;
    else if (acao === 'remover') removerArte(arte);
    desenharLista();
    desenhar();
  });
  $('lista').addEventListener('keydown', (e) => {
    if (e.target.id === 'vazio' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('arquivos').click(); }
    if (e.key === 'Enter' && e.target.matches('input[data-campo]')) e.target.blur();
  });
  $('lista').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-campo]');
    if (!inp) return;
    const arte = arteDe(inp.closest('[data-arte]').dataset.arte);
    if (!arte) return;
    const v = parseFloat(String(inp.value).replace(',', '.'));
    if (inp.dataset.campo === 'qtd') mudarQtd(arte, v);
    else mudarTamanho(arte, inp.dataset.campo, v);
    desenharLista();
    desenhar();
  });

  // ---------- visualização ----------
  function escala() {
    const visor = $('visor');
    const disponivel = Math.max(120, visor.clientWidth - (innerWidth <= 860 ? 52 : 64));
    const ajuste = disponivel / FILME_MM;
    return est.zoom ? ajuste * est.zoom : ajuste;
  }

  function sobrepostas() {
    const ruins = new Set();
    const L = comprimento();
    const caixas = est.pecas.map((p) => { const m = medida(p); return { id: p.id, x: p.x, y: p.y, w: m.w, h: m.h }; });
    const limiteY = est.modo === 'fixo' ? L - est.margem - (est.ident ? est.espaco + IDENT_MM : 0) : Infinity;
    for (const c of caixas) {
      if (c.x < est.margem - 0.05 || c.x + c.w > FILME_MM - est.margem + 0.05 || c.y < est.margem - 0.05 || c.y + c.h > limiteY + 0.05) ruins.add(c.id);
    }
    for (let i = 0; i < caixas.length; i++) {
      for (let j = i + 1; j < caixas.length; j++) {
        const a = caixas[i], b = caixas[j];
        if (a.x < b.x + b.w - 0.05 && a.x + a.w > b.x + 0.05 && a.y < b.y + b.h - 0.05 && a.y + a.h > b.y + 0.05) { ruins.add(a.id); ruins.add(b.id); }
      }
    }
    return ruins;
  }

  function desenhar() {
    const s = escala();
    const L = comprimento();
    const W = FILME_MM * s, H = L * s;
    const trilho = $('trilho'), filme = $('filme');
    trilho.style.width = W + 'px';
    trilho.style.height = H + 'px';
    filme.style.width = W + 'px';
    filme.style.height = H + 'px';
    $('zoomValor').textContent = Math.round((est.zoom || 1) * 100) + '%';

    // réguas: a cada 5 cm na largura e a cada 10 cm no comprimento
    let rx = '';
    for (let c = 0; c <= 57; c += 5) rx += `<span class="marca-x" style="left:${c * 10 * s}px">${c}</span>`;
    $('reguaX').innerHTML = rx;
    const passo = H > 2500 ? 50 : 10;
    let ry = '';
    for (let c = 0; c * 10 <= L; c += passo) ry += `<span class="marca-y" style="top:${c * 10 * s}px">${c % 100 === 0 && c ? c / 100 + ' m' : c}</span>`;
    $('reguaY').innerHTML = ry;

    const ruins = sobrepostas();
    let html = `<div class="limite" style="left:${est.margem * s}px;top:${est.margem * s}px;width:${(FILME_MM - 2 * est.margem) * s}px;height:${(L - 2 * est.margem) * s}px"></div>`;
    for (const p of est.pecas) {
      const a = arteDe(p.arte), m = medida(p);
      const img = p.rot
        ? `<img src="${a.url}" alt="" draggable="false" style="width:${a.w * s}px;height:${a.h * s}px;transform:translateX(${a.h * s}px) rotate(90deg)">`
        : `<img src="${a.url}" alt="" draggable="false" style="width:${a.w * s}px;height:${a.h * s}px">`;
      const cls = 'peca' + (est.sel.has(p.id) ? ' sel' : '') + (ruins.has(p.id) ? ' ruim' : '');
      html += `<div class="${cls}" data-peca="${p.id}" style="left:${p.x * s}px;top:${p.y * s}px;width:${m.w * s}px;height:${m.h * s}px" title="${esc(a.nome)} · ${cm(m.w)} × ${cm(m.h)} cm">${img}</div>`;
    }
    if (est.ident) {
      const t = IDENT_MM * 0.75 * s;
      html += `<div class="ident" style="left:${est.margem * s}px;top:${(L - est.margem - IDENT_MM) * s}px;font-size:${t}px;height:${IDENT_MM * s}px;display:flex;align-items:center;color:#fff">${esc(est.ident)}</div>`;
    }
    if (est.modo === 'fixo' && necessario() > L + 0.05) html += `<div class="corte" style="top:${L * s - 1}px"></div>`;
    filme.innerHTML = html;
    atualizarEstado(ruins, L);
  }

  function atualizarEstado(ruins, L) {
    const el = $('estado');
    const n = est.pecas.length;
    let txt, cls = '';
    let pode = n > 0;
    if (!n) txt = 'Nenhuma arte';
    else if (est.modo === 'fixo' && necessario() > L + 0.05) {
      txt = `Não cabe em ${metrosTxt(L)}: a fila precisa de ${metrosTxt(Math.ceil(necessario() / 10) * 10)}.`;
      cls = 'erro'; pode = false;
    } else if (ruins.size) {
      txt = `${ruins.size} arte(s) sobrepostas ou fora da área. Use Organizar.`;
      cls = 'erro'; pode = false;
    } else if (comprimento() / 1000 > MAX_METROS) {
      txt = `Máximo de ${MAX_METROS} m por arquivo.`;
      cls = 'erro'; pode = false;
    } else txt = `${n} ${n === 1 ? 'arte' : 'artes'} · ${metrosTxt(L)} · ${fmt(Math.min(100, (areaPecas() / ((FILME_MM - 2 * est.margem) * L)) * 100), 0)}% aproveitado`;
    el.textContent = txt;
    el.className = 'estado num ' + cls;
    $('btnBaixar').disabled = !pode;
  }
  function areaPecas() { return est.pecas.reduce((s, p) => { const m = medida(p); return s + m.w * m.h; }, 0); }

  // ---------- arrastar e selecionar ----------
  let arrasto = null;
  $('filme').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-peca]');
    if (!el) { if (est.sel.size) { est.sel.clear(); desenhar(); desenharLista(); } return; }
    const id = el.dataset.peca;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (est.sel.has(id)) est.sel.delete(id); else est.sel.add(id);
      desenhar(); desenharLista();
      return;
    }
    if (!est.sel.has(id)) { est.sel.clear(); est.sel.add(id); }
    e.preventDefault();
    const s = escala();
    const pecas = est.pecas.filter((p) => est.sel.has(p.id));
    arrasto = { x0: e.clientX, y0: e.clientY, s, mexeu: false, pecas: pecas.map((p) => ({ p, x: p.x, y: p.y, m: medida(p) })), el };
    el.setPointerCapture(e.pointerId);
    desenhar(); desenharLista();
  });
  $('filme').addEventListener('pointermove', (e) => {
    if (!arrasto) return;
    let dx = (e.clientX - arrasto.x0) / arrasto.s, dy = (e.clientY - arrasto.y0) / arrasto.s;
    if (!arrasto.mexeu && Math.hypot(dx, dy) * arrasto.s < 3) return;
    arrasto.mexeu = true;
    // o grupo inteiro fica dentro da área útil
    for (const q of arrasto.pecas) {
      dx = Math.max(dx, est.margem - q.x);
      dx = Math.min(dx, FILME_MM - est.margem - q.m.w - q.x);
      dy = Math.max(dy, est.margem - q.y);
    }
    const filme = $('filme');
    for (const q of arrasto.pecas) {
      q.p.x = Math.round((q.x + dx) * 10) / 10;
      q.p.y = Math.round((q.y + dy) * 10) / 10;
      const d = filme.querySelector(`[data-peca="${q.p.id}"]`);
      if (d) { d.style.left = q.p.x * arrasto.s + 'px'; d.style.top = q.p.y * arrasto.s + 'px'; d.classList.add('movendo'); }
    }
  });
  const soltar = () => { if (arrasto) { const m = arrasto.mexeu; arrasto = null; if (m) desenhar(); } };
  $('filme').addEventListener('pointerup', soltar);
  $('filme').addEventListener('pointercancel', soltar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modalBaixar').hidden) { fecharModal(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && est.sel.size && !e.target.closest('input, select, textarea')) {
      e.preventDefault();
      const sai = new Set(est.sel);
      est.pecas = est.pecas.filter((p) => !sai.has(p.id));
      est.sel.clear();
      for (const a of [...est.artes]) {
        a.qtd = est.pecas.filter((p) => p.arte === a.id).length;
        if (!a.qtd) removerArte(a);
      }
      desenharLista(); desenhar();
    }
  });

  // ---------- zoom ----------
  const NIVEIS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
  function zoomPara(z) { est.zoom = z === 1 ? null : z; desenhar(); }
  $('zoomMais').addEventListener('click', () => { const z = est.zoom || 1; zoomPara(NIVEIS.find((n) => n > z + 1e-9) || z); });
  $('zoomMenos').addEventListener('click', () => { const z = est.zoom || 1; zoomPara([...NIVEIS].reverse().find((n) => n < z - 1e-9) || z); });
  $('zoomAjustar').addEventListener('click', () => zoomPara(1));
  let redim = 0;
  addEventListener('resize', () => { cancelAnimationFrame(redim); redim = requestAnimationFrame(desenhar); });

  // ---------- ajustes do filme ----------
  const numero = (id, min, max, padrao) => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    const ok = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
    $(id).value = ok;
    return ok;
  };
  $('modo').addEventListener('change', () => {
    est.modo = $('modo').value;
    $('metros').hidden = est.modo !== 'fixo';
    if (est.modo === 'fixo') { $('metros').value = fmtMetros(comprimento()); est.metros = numero('metros', 0.1, MAX_METROS, 1); }
    desenhar();
  });
  const fmtMetros = (mm) => String(Math.max(0.1, Math.ceil(mm / 100) / 10));
  $('metros').addEventListener('change', () => { est.metros = numero('metros', 0.1, MAX_METROS, 1); desenhar(); });
  $('espaco').addEventListener('change', () => { est.espaco = numero('espaco', 0, 50, 5); organizar(); });
  $('margem').addEventListener('change', () => {
    const nova = numero('margem', 0, 30, 3);
    est.margem = nova;
    for (const a of est.artes) {
      if (!cabe(a.w, a.h)) { const u = larguraUtil(); const f = u / Math.min(a.w, a.h); a.w = arred(a.w * f); a.h = arred(a.h * f); }
    }
    organizar(); desenharLista();
  });
  $('girar').addEventListener('change', () => { est.girar = $('girar').checked; organizar(); });
  $('ident').addEventListener('input', () => { est.ident = $('ident').value.trim(); desenhar(); });

  // ---------- adicionar ----------
  $('btnAdicionar').addEventListener('click', () => $('arquivos').click());
  $('arquivos').addEventListener('change', () => { adicionarArquivos($('arquivos').files); $('arquivos').value = ''; });
  $('btnOrganizar').addEventListener('click', () => { if (est.pecas.length) organizar(); });
  let arrastando = 0;
  addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { arrastando++; $('soltar').hidden = false; } });
  addEventListener('dragleave', () => { if (--arrastando <= 0) { arrastando = 0; $('soltar').hidden = true; } });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => {
    e.preventDefault();
    arrastando = 0; $('soltar').hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files);
  });

  // ---------- gerar o PNG ----------
  let gerando = false, urlArquivo = null;
  function fecharModal() {
    if (gerando) return;
    $('modalBaixar').hidden = true;
    if (urlArquivo) { URL.revokeObjectURL(urlArquivo); urlArquivo = null; }
  }
  $('modalBaixar').addEventListener('click', (e) => { if (e.target === $('modalBaixar') || e.target.closest('[data-fechar]')) fecharModal(); });

  function nomeArquivo(L) {
    const id = est.ident.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return `fila-dtf-57cm-${fmt(L / 1000, 2)}m${id ? '-' + id : ''}.png`;
  }

  $('btnBaixar').addEventListener('click', async () => {
    if (gerando || $('btnBaixar').disabled) return;
    const L = comprimento();
    const altura = Math.round(L * PX_MM);
    gerando = true;
    $('modalBaixar').hidden = false;
    $('baixarSalvar').hidden = true;
    $('modalBaixar').querySelector('[data-fechar]').disabled = true;
    $('tituloBaixar').textContent = 'Gerando PNG';
    $('baixarResumo').textContent = `57 cm × ${metrosTxt(L)} · ${FILME_PX} × ${altura} px · 300 DPI`;
    $('baixarBarra').style.width = '0%';
    $('baixarInfo').textContent = '0%';
    try {
      if (document.fonts && est.ident) await document.fonts.load(`700 40px Inter`);
      const pecas = est.pecas.map((p) => {
        const a = arteDe(p.arte), m = medida(p);
        return { a, rot: p.rot, x: p.x * PX_MM, y: p.y * PX_MM, w: m.w * PX_MM, h: m.h * PX_MM };
      });
      const cv = document.createElement('canvas');
      cv.width = FILME_PX;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const partes = await Png.gerarPNG({
        largura: FILME_PX, altura, dpi: DPI, alturaFaixa: 512,
        faixa: async (y0, n) => {
          if (cv.height !== n) cv.height = n; else ctx.clearRect(0, 0, FILME_PX, n);
          ctx.setTransform(1, 0, 0, 1, 0, -y0);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          for (const q of pecas) {
            if (q.y > y0 + n || q.y + q.h < y0) continue;
            ctx.save();
            if (q.rot) {
              ctx.translate(q.x + q.w, q.y);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(q.a.bitmap, 0, 0, q.h, q.w);
            } else ctx.drawImage(q.a.bitmap, q.x, q.y, q.w, q.h);
            ctx.restore();
          }
          if (est.ident) {
            const yT = (L - est.margem - IDENT_MM) * PX_MM;
            if (yT < y0 + n && yT + IDENT_MM * PX_MM > y0) {
              ctx.font = `700 ${Math.round(IDENT_MM * 0.75 * PX_MM)}px Inter, sans-serif`;
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#ffffff';
              ctx.fillText(est.ident, est.margem * PX_MM, yT + (IDENT_MM * PX_MM) / 2);
            }
          }
          const dados = ctx.getImageData(0, 0, FILME_PX, n).data;
          await new Promise((ok) => setTimeout(ok, 0)); // deixa a tela respirar
          return dados;
        },
        aoProgresso: (f) => {
          const pct = Math.round(f * 100);
          $('baixarBarra').style.width = pct + '%';
          $('baixarInfo').textContent = pct < 100 ? pct + '%' : 'Finalizando…';
        },
      });
      const blob = new Blob(partes, { type: 'image/png' });
      urlArquivo = URL.createObjectURL(blob);
      const a = $('baixarSalvar');
      a.href = urlArquivo;
      a.download = nomeArquivo(L);
      a.hidden = false;
      $('tituloBaixar').textContent = 'PNG pronto';
      $('baixarBarra').style.width = '100%';
      $('baixarInfo').textContent = `${a.download} · ${fmt(blob.size / 1048576, 1)} MB`;
    } catch (e) {
      $('tituloBaixar').textContent = 'Não foi possível gerar';
      $('baixarInfo').textContent = 'Tente um comprimento menor ou feche outras abas e gere de novo.';
    } finally {
      gerando = false;
      $('modalBaixar').querySelector('[data-fechar]').disabled = false;
    }
  });

  desenharLista();
  desenhar();
})();
