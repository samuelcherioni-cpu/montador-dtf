// Pedidos no Google Drive da Zavari: pasta "Pedidos Fila DTF" (criada sozinha na primeira vez).
// Único arquivo do servidor que fala com fora, e só com a API do Google (googleapis.com).
// A autorização é "drive.file": o site só enxerga os arquivos e a pasta que ele mesmo criou, nada
// mais do Drive. Segredos (no projeto da Cloudflare, nunca no código):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — o "app" criado no Google Cloud
//   GOOGLE_REFRESH_TOKEN                   — a autorização dada uma vez pela conta Google do Drive

const API = (env) => env.GOOGLE_TESTE || 'https://www.googleapis.com';
const TOKEN = (env) => (env.GOOGLE_TESTE ? env.GOOGLE_TESTE + '/token' : 'https://oauth2.googleapis.com/token');
const PASTA = 'Pedidos Fila DTF';
const DIAS = 30; // pedidos mais velhos vão para a lixeira do Drive (de lá ainda dá para recuperar)

export const driveConfigurado = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);

let acesso = { token: '', ate: 0 };
let pastaId = '';

class ErroDrive extends Error {}

async function token(env) {
  if (acesso.token && Date.now() < acesso.ate) return acesso.token;
  const r = await fetch(TOKEN(env), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new ErroDrive('AUTORIZACAO_GOOGLE ' + r.status);
  const j = await r.json();
  acesso = { token: j.access_token, ate: Date.now() + (Number(j.expires_in || 3600) - 120) * 1000 };
  return acesso.token;
}

async function api(env, caminho, opcoes = {}) {
  const r = await fetch(API(env) + caminho, {
    ...opcoes,
    headers: { authorization: 'Bearer ' + (await token(env)), ...(opcoes.headers || {}) },
  });
  if (!r.ok) throw new ErroDrive('DRIVE ' + r.status + ' ' + caminho.split('?')[0]);
  return r;
}

const consulta = (q, campos, extra = '') =>
  `/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(campos)}&spaces=drive${extra}`;

async function pasta(env) {
  if (pastaId) return pastaId;
  const q = "mimeType='application/vnd.google-apps.folder' and appProperties has { key='fila' and value='pasta' } and trashed=false";
  const achou = await (await api(env, consulta(q, 'files(id)'))).json();
  if (achou.files && achou.files.length) return (pastaId = achou.files[0].id);
  const nova = await (await api(env, '/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: PASTA, mimeType: 'application/vnd.google-apps.folder', appProperties: { fila: 'pasta' } }),
  })).json();
  return (pastaId = nova.id);
}

// O Drive aceita até 124 bytes por par chave+valor nas propriedades do arquivo
function cortar(chave, valor) {
  let v = String(valor || '');
  const enc = new TextEncoder();
  while (enc.encode(chave + v).length > 120) v = v.slice(0, -1);
  return v;
}

// Grava o PNG direto da requisição do cliente para o Drive (envio retomável), sem guardar na memória
export async function gravarPedido(env, { codigo, pedido, corpo, tamanho }) {
  const props = { fila: 'pedido', codigo };
  for (const [k, v] of Object.entries(pedido)) props[k] = cortar(k, v);
  const nome = `${codigo} · ${pedido.nome} · ${pedido.metros} m.png`.replace(/[\\/]/g, '-');
  const descricao = `Cliente: ${pedido.nome}\nTelefone: ${pedido.telefone}\nRetirada: ${pedido.retirada}\nFilme: 57 cm × ${pedido.metros} m · ${pedido.artes} artes`;
  const sessao = await api(env, '/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'image/png', 'x-upload-content-length': String(tamanho) },
    body: JSON.stringify({ name: nome, parents: [await pasta(env)], mimeType: 'image/png', description: descricao, appProperties: props }),
  });
  const destino = sessao.headers.get('location');
  if (!destino || !destino.startsWith(API(env) + '/')) throw new ErroDrive('DRIVE_SESSAO');
  // tamanho fixo: o Google exige saber o tamanho do arquivo enviado
  const { readable, writable } = new FixedLengthStream(tamanho);
  corpo.pipeTo(writable).catch(() => {});
  const r = await fetch(destino, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: readable });
  if (!r.ok) throw new ErroDrive('DRIVE_ENVIO ' + r.status);
  return (await r.json()).id;
}

const CAMPOS = 'files(id,name,size,createdTime,appProperties)';

export async function acharPedido(env, codigo) {
  const q = `appProperties has { key='codigo' and value='${codigo}' } and trashed=false`;
  const j = await (await api(env, consulta(q, CAMPOS))).json();
  return (j.files && j.files[0]) || null;
}

export async function baixarPedido(env, id) {
  return api(env, `/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
}

export async function listarPedidos(env) {
  const q = "appProperties has { key='fila' and value='pedido' } and trashed=false";
  const j = await (await api(env, consulta(q, CAMPOS, '&orderBy=createdTime%20desc&pageSize=100'))).json();
  return (j.files || []).map((f) => ({ ...(f.appProperties || {}), tamanho: Number(f.size || 0), criado: (f.appProperties || {}).criado || f.createdTime }));
}

// Pedidos com mais de 30 dias vão para a lixeira do Drive (o Google esvazia a lixeira depois de 30 dias)
export async function arquivarAntigos(env) {
  const limite = new Date(Date.now() - DIAS * 86400e3).toISOString();
  const q = `appProperties has { key='fila' and value='pedido' } and trashed=false and createdTime < '${limite}'`;
  const j = await (await api(env, consulta(q, 'files(id)', '&pageSize=50'))).json();
  for (const f of j.files || []) {
    await api(env, `/drive/v3/files/${encodeURIComponent(f.id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    });
  }
}
