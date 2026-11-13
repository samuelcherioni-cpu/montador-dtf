// GET /api/pedidos — lista dos pedidos recentes (só admin): código, cliente, telefone, retirada, metros.
import { json, ehAdmin } from '../_comum.js';

export async function onRequestGet({ request, env }) {
  if (!(await ehAdmin(request, env))) return json(401, { ok: false, erro: 'SO_ADMIN' });
  if (!env.PEDIDOS) return json(503, { ok: false, erro: 'NAO_CONFIGURADO' });
  const lista = await env.PEDIDOS.list({ prefix: 'pedidos/', include: ['customMetadata'], limit: 1000 });
  const pedidos = lista.objects.map((o) => ({
    codigo: o.key.slice('pedidos/'.length, -'.png'.length),
    tamanho: o.size,
    ...(o.customMetadata || {}),
    criado: (o.customMetadata && o.customMetadata.criado) || o.uploaded,
  })).sort((a, b) => String(b.criado).localeCompare(String(a.criado))).slice(0, 100);
  return json(200, { ok: true, pedidos });
}
