// GET /api/pedido/CODIGO — baixa o PNG de um pedido. Só com a sessão de admin.
// Sem sessão (ex.: alguém abriu o link do WhatsApp), vai para a tela da Fila DTF que pede o PIN e
// depois volta para cá.
import { ehAdmin, chaveDoPedido, codigoValido } from '../../_comum.js';

export async function onRequestGet({ request, env, params }) {
  const codigo = String(params.codigo || '').toUpperCase();
  if (!codigoValido(codigo)) return new Response('Pedido não encontrado.', { status: 404 });
  if (!(await ehAdmin(request, env))) {
    return Response.redirect(new URL('/?pedido=' + codigo, request.url).toString(), 303);
  }
  if (!env.PEDIDOS) return new Response('Armazenamento de pedidos não configurado.', { status: 503 });
  const obj = await env.PEDIDOS.get(chaveDoPedido(codigo));
  if (!obj) return new Response('Pedido não encontrado (pode ter passado de 30 dias).', { status: 404 });
  const m = obj.customMetadata || {};
  const nome = `fila-dtf-${codigo}-${(m.nome || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').slice(0, 30)}-${m.metros || ''}m.png`;
  return new Response(obj.body, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(obj.size),
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'private, no-store',
    },
  });
}
