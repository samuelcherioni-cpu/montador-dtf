// Google Drive falso, só para testar o servidor da Fila DTF no computador (porta 8791).
// Imita o pedaço da API que a Fila usa: token, criar pasta, envio retomável, buscar, baixar e lixeira.
// O .dev.vars aponta GOOGLE_TESTE=http://127.0.0.1:8791 para o servidor local usar este no lugar do Google.
'use strict';
const http = require('http');
const PORTA = 8791, BASE = 'http://127.0.0.1:' + PORTA;
const arquivos = new Map(); // id -> { meta, bytes }
const sessoes = new Map();
let seq = 0;

function lerCorpo(req) {
  return new Promise((ok) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); });
}
const enviar = (res, status, obj, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...extra }); res.end(JSON.stringify(obj)); };

// entende só as consultas que a Fila faz
function bate(meta, q) {
  if (/trashed=false/.test(q) && meta.trashed) return false;
  for (const [, k, v] of q.matchAll(/appProperties has \{ key='(\w+)' and value='([^']*)' \}/g)) if ((meta.appProperties || {})[k] !== v) return false;
  const antes = q.match(/createdTime < '([^']+)'/);
  if (antes && !(meta.createdTime < antes[1])) return false;
  if (/mimeType='application\/vnd.google-apps.folder'/.test(q) && meta.mimeType !== 'application/vnd.google-apps.folder') return false;
  return true;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const corpo = await lerCorpo(req);
  const autorizado = req.headers.authorization === 'Bearer token-falso';
  if (u.pathname === '/token') return enviar(res, 200, { access_token: 'token-falso', expires_in: 3600 });
  if (!autorizado && !u.pathname.startsWith('/sessao/')) return enviar(res, 401, { erro: 'sem token' });

  if (u.pathname === '/drive/v3/files' && req.method === 'GET') {
    const q = u.searchParams.get('q') || '';
    let lista = [...arquivos.values()].map((a) => a.meta).filter((m) => bate(m, q));
    lista.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    return enviar(res, 200, { files: lista.map((m) => ({ ...m, size: String(m.size || 0) })) });
  }
  if (u.pathname === '/drive/v3/files' && req.method === 'POST') {
    const meta = { ...JSON.parse(corpo), id: 'f' + ++seq, createdTime: new Date().toISOString() };
    arquivos.set(meta.id, { meta, bytes: Buffer.alloc(0) });
    return enviar(res, 200, { id: meta.id });
  }
  if (u.pathname === '/upload/drive/v3/files' && u.searchParams.get('uploadType') === 'resumable') {
    const s = 's' + ++seq;
    sessoes.set(s, { meta: JSON.parse(corpo), tamanho: Number(req.headers['x-upload-content-length']) });
    res.writeHead(200, { location: BASE + '/sessao/' + s }); return res.end();
  }
  const sessao = u.pathname.match(/^\/sessao\/(\w+)$/);
  if (sessao && req.method === 'PUT') {
    const s = sessoes.get(sessao[1]);
    if (!s) return enviar(res, 404, {});
    if (corpo.length !== s.tamanho) return enviar(res, 400, { erro: 'tamanho ' + corpo.length + ' != ' + s.tamanho });
    const meta = { ...s.meta, id: 'f' + ++seq, size: corpo.length, createdTime: new Date().toISOString() };
    arquivos.set(meta.id, { meta, bytes: corpo });
    console.log(`[google falso] gravado ${meta.name} (${corpo.length} bytes)`);
    return enviar(res, 200, { id: meta.id });
  }
  const um = u.pathname.match(/^\/drive\/v3\/files\/(\w+)$/);
  if (um) {
    const a = arquivos.get(um[1]);
    if (!a) return enviar(res, 404, {});
    if (req.method === 'PATCH') { Object.assign(a.meta, JSON.parse(corpo)); return enviar(res, 200, { id: a.meta.id }); }
    if (u.searchParams.get('alt') === 'media') { res.writeHead(200, { 'content-type': 'image/png', 'content-length': a.bytes.length }); return res.end(a.bytes); }
    return enviar(res, 200, a.meta);
  }
  enviar(res, 404, { erro: 'rota desconhecida ' + req.method + ' ' + u.pathname });
}).listen(PORTA, '127.0.0.1', () => console.log('[google falso] ' + BASE));
