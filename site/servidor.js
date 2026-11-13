// Única parte da página que conversa com um servidor: as rotas da própria Fila DTF (mesma origem).
// Nada de outros sistemas. A checagem de isolamento só deixa chamada de rede neste arquivo.
(function (raiz) {
  'use strict';
  const ROTAS = { admin: '/api/admin', pedido: '/api/pedido', pedidos: '/api/pedidos' };

  async function pedir(rota, opcoes = {}) {
    try {
      const r = await fetch(ROTAS[rota], { credentials: 'same-origin', cache: 'no-store', ...opcoes });
      let corpo = {};
      try { corpo = await r.json(); } catch (_) { /* sem corpo */ }
      return { status: r.status, ...corpo };
    } catch (_) { return { status: 0, ok: false, erro: 'SEM_CONEXAO' }; }
  }

  const b64url = (texto) => {
    const bytes = new TextEncoder().encode(texto);
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  // Envia o PNG com barra de progresso (o fetch não informa o progresso do envio; o XHR informa)
  function enviarArquivo(blob, dados, aoProgresso) {
    return new Promise((ok) => {
      const x = new XMLHttpRequest();
      x.open('POST', ROTAS.pedido);
      x.setRequestHeader('content-type', 'image/png');
      x.setRequestHeader('x-pedido', b64url(JSON.stringify(dados)));
      x.upload.onprogress = (e) => { if (e.lengthComputable && aoProgresso) aoProgresso(e.loaded / e.total); };
      x.onload = () => { let c = {}; try { c = JSON.parse(x.responseText); } catch (_) { /* resposta inválida */ } ok({ status: x.status, ...c }); };
      x.onerror = () => ok({ status: 0, ok: false, erro: 'SEM_CONEXAO' });
      x.send(blob);
    });
  }

  raiz.Servidor = {
    souAdmin: async () => !!(await pedir('admin')).admin,
    entrar: (pin) => pedir('admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) }),
    sair: () => pedir('admin', { method: 'DELETE' }),
    pedidos: () => pedir('pedidos'),
    enviarArquivo,
    linkDoPedido: (codigo) => location.origin + ROTAS.pedido + '/' + codigo,
  };
})(self);
