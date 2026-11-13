// Funções comuns do servidor da Fila DTF (Cloudflare Pages Functions).
// Nada aqui conversa com outros sistemas: só com o armazenamento de pedidos (R2, ligação PEDIDOS).
// Segredos (cadastrados no projeto da Cloudflare, nunca no código):
//   PIN_ADMIN       — PIN de admin (ou PIN_ADMIN_HASH, com o SHA-256 dele)
//   SEGREDO_LINK    — texto longo aleatório, assina a sessão de admin

const enc = new TextEncoder();
export const COOKIE = 'fila_admin';
const HORAS = 12;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(texto) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto))); }
async function hmac(texto, segredo) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', chave, enc.encode(texto)));
}

// Comparação em tempo constante, para não vazar nada pelo tempo de resposta
export function iguais(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

export const json = (status, corpo, extra = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

// Sessão de admin: "validade.assinatura" num cookie HttpOnly de 12 h
export async function criarSessao(env) {
  const exp = String(Date.now() + HORAS * 3600e3);
  return `${COOKIE}=${exp}.${await hmac('admin|' + exp, env.SEGREDO_LINK)}; Path=/; Max-Age=${HORAS * 3600}; HttpOnly; Secure; SameSite=Lax`;
}
export const apagarSessao = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export async function ehAdmin(request, env) {
  if (!env.SEGREDO_LINK) return false;
  const bruto = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!bruto) return false;
  const [exp, assinatura] = bruto.slice(COOKIE.length + 1).split('.');
  if (!exp || !assinatura || !(Number(exp) > Date.now())) return false;
  return iguais(assinatura, await hmac('admin|' + exp, env.SEGREDO_LINK));
}

// Limite de tentativas por IP (na memória do servidor)
const registros = new Map();
export function bloqueado(chave, max, janelaMs) {
  const r = registros.get(chave);
  return !!(r && Date.now() - r.desde < janelaMs && r.n >= max);
}
export function contar(chave, janelaMs) {
  const agora = Date.now(), r = registros.get(chave);
  const novo = r && agora - r.desde < janelaMs ? r : { n: 0, desde: agora };
  novo.n++;
  registros.set(chave, novo);
}
export const limpar = (chave) => registros.delete(chave);
export const ipDe = (request) => request.headers.get('cf-connecting-ip') || 'local';

// Código curto do pedido (sem letras que se confundem: 0/O, 1/I/L)
export function novoCodigo() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => letras[x % letras.length]).join('');
}
export const chaveDoPedido = (codigo) => `pedidos/${codigo}.png`;
export const codigoValido = (c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c || '');

// Texto curto e limpo vindo do cliente (vai para o nome do arquivo e para a lista de pedidos)
export const texto = (v, max) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
