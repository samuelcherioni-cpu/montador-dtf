// /api/admin — entrada do administrador por PIN (o PIN fica só nos segredos da Cloudflare).
//   GET    -> { admin: true|false }  (a tela pergunta se já está com sessão)
//   POST   -> { pin }  confere e cria a sessão de 12 h
//   DELETE -> sai
import { json, sha256, iguais, criarSessao, apagarSessao, ehAdmin, bloqueado, contar, limpar, ipDe } from '../_comum.js';

const MAX_ERROS = 10, JANELA_MS = 10 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  return json(200, { admin: await ehAdmin(request, env) });
}

export async function onRequestPost({ request, env }) {
  // PIN_ADMIN (o próprio PIN, guardado como segredo) ou PIN_ADMIN_HASH (o SHA-256 dele)
  const esperado = env.PIN_ADMIN ? await sha256(String(env.PIN_ADMIN).trim()) : String(env.PIN_ADMIN_HASH || '').toLowerCase();
  if (!esperado || !env.SEGREDO_LINK) return json(503, { ok: false, erro: 'NAO_CONFIGURADO' });
  const ip = ipDe(request), chave = 'pin|' + ip;
  if (bloqueado(chave, MAX_ERROS, JANELA_MS)) return json(429, { ok: false, erro: 'BLOQUEADO' });
  let pin = '';
  try { pin = String((await request.json()).pin || '').trim(); } catch (_) { /* corpo inválido conta como erro */ }
  const certo = /^\d{4}$/.test(pin) && iguais(await sha256(pin), esperado);
  if (!certo) {
    contar(chave, JANELA_MS);
    await new Promise((ok) => setTimeout(ok, 800)); // atrasa tentativas em sequência
    return json(401, { ok: false, erro: 'PIN_INVALIDO' });
  }
  limpar(chave);
  return json(200, { ok: true }, { 'set-cookie': await criarSessao(env) });
}

export async function onRequestDelete() {
  return json(200, { ok: true }, { 'set-cookie': apagarSessao() });
}
