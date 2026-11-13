// POST /api/pedido — o cliente envia a fila pronta (PNG 300 DPI) para a Zavari.
// Corpo: o próprio PNG. Dados do cliente no cabeçalho x-pedido (JSON em base64url).
// Grava no armazenamento de pedidos (R2) com um código curto e devolve o código.
// O cliente nunca recebe o arquivo de volta: só quem entra com o PIN de admin baixa.
import { json, novoCodigo, chaveDoPedido, texto, bloqueado, contar, ipDe } from '../_comum.js';

const MAX_BYTES = 95 * 1024 * 1024;        // abaixo do limite de 100 MB por pedido da Cloudflare
const MAX_PEDIDOS = 20, JANELA_MS = 60 * 60 * 1000; // por IP, por hora (evita abuso do armazenamento)

export async function onRequestPost({ request, env }) {
  if (!env.PEDIDOS) return json(503, { ok: false, erro: 'NAO_CONFIGURADO' });
  // só da própria página (outro site não consegue mandar arquivo para cá em nome do cliente)
  const origem = request.headers.get('origin');
  if (origem && origem !== new URL(request.url).origin) return json(403, { ok: false, erro: 'ORIGEM' });
  const ip = ipDe(request), chave = 'envio|' + ip;
  if (bloqueado(chave, MAX_PEDIDOS, JANELA_MS)) return json(429, { ok: false, erro: 'MUITOS_ENVIOS' });

  if ((request.headers.get('content-type') || '').split(';')[0].trim() !== 'image/png') return json(415, { ok: false, erro: 'SO_PNG' });
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (!tamanho) return json(411, { ok: false, erro: 'SEM_TAMANHO' });
  if (tamanho > MAX_BYTES) return json(413, { ok: false, erro: 'GRANDE_DEMAIS' });

  let dados = {};
  try {
    const bruto = (request.headers.get('x-pedido') || '').replace(/-/g, '+').replace(/_/g, '/');
    dados = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(bruto), (c) => c.charCodeAt(0))));
  } catch (_) { return json(400, { ok: false, erro: 'DADOS' }); }
  const pedido = {
    nome: texto(dados.nome, 60), telefone: texto(dados.telefone, 20).replace(/[^\d()+\- ]/g, ''),
    retirada: texto(dados.retirada, 40), metros: texto(dados.metros, 10), artes: texto(dados.artes, 6),
    criado: new Date().toISOString(),
  };
  if (!pedido.nome || pedido.telefone.replace(/\D/g, '').length < 10 || !pedido.retirada) return json(400, { ok: false, erro: 'DADOS' });

  const codigo = novoCodigo();
  // o arquivo vai direto da requisição para o armazenamento, sem passar inteiro pela memória
  await env.PEDIDOS.put(chaveDoPedido(codigo), request.body, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: pedido,
  });
  contar(chave, JANELA_MS);
  return json(200, { ok: true, codigo });
}
