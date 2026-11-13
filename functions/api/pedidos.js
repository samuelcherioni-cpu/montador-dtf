// GET /api/pedidos — lista dos pedidos recentes (só admin): código, cliente, telefone, retirada, metros.
// De carona, manda para a lixeira do Drive os pedidos com mais de 30 dias.
import { json, ehAdmin } from '../_comum.js';
import { driveConfigurado, listarPedidos, arquivarAntigos } from '../_drive.js';

export async function onRequestGet({ request, env, waitUntil }) {
  if (!(await ehAdmin(request, env))) return json(401, { ok: false, erro: 'SO_ADMIN' });
  if (!driveConfigurado(env)) return json(503, { ok: false, erro: 'NAO_CONFIGURADO' });
  try {
    const pedidos = await listarPedidos(env);
    waitUntil(arquivarAntigos(env).catch((e) => console.log('limpeza: ' + e.message)));
    return json(200, { ok: true, pedidos });
  } catch (e) {
    console.log('lista falhou: ' + e.message);
    return json(502, { ok: false, erro: 'DRIVE' });
  }
}
