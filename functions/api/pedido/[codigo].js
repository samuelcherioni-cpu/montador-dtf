// GET /api/pedido/CODIGO — baixa o PNG de um pedido. Só com a sessão de admin.
// Sem sessão (ex.: alguém abriu o link do WhatsApp), vai para a tela da Fila DTF que pede o PIN e
// depois volta para cá.
import { ehAdmin, codigoValido } from '../../_comum.js';
import { driveConfigurado, acharPedido, baixarPedido } from '../../_drive.js';

export async function onRequestGet({ request, env, params }) {
  const codigo = String(params.codigo || '').toUpperCase();
  if (!codigoValido(codigo)) return new Response('Pedido não encontrado.', { status: 404 });
  if (!(await ehAdmin(request, env))) {
    return Response.redirect(new URL('/?pedido=' + codigo, request.url).toString(), 303);
  }
  if (!driveConfigurado(env)) return new Response('Google Drive dos pedidos não configurado.', { status: 503 });
  let arq, obj;
  try {
    arq = await acharPedido(env, codigo);
    if (arq) obj = await baixarPedido(env, arq.id);
  } catch (e) {
    console.log('download falhou: ' + e.message);
    return new Response('O Google Drive não respondeu. Tente de novo.', { status: 502 });
  }
  if (!arq) return new Response('Pedido não encontrado (pode ter passado de 30 dias: veja a lixeira do Drive).', { status: 404 });
  const m = arq.appProperties || {};
  const nome = `fila-dtf-${codigo}-${(m.nome || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').slice(0, 30)}-${m.metros || ''}m.png`;
  return new Response(obj.body, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(arq.size),
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'private, no-store',
    },
  });
}
