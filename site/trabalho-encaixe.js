// Trabalhador do encaixe: roda em segundo plano (sem travar a tela) e devolve cada montagem melhor
// que encontrar. Recebe as peças com o formato de cada arte; não acessa nada fora da página.
importScripts('encaixe.js' + self.location.search);

self.onmessage = (e) => {
  const { id, largura, espaco, girar, novas, limiteMs, semente, evitar } = e.data;
  let ultimo = 0;
  const enviar = (r, tipo) => self.postMessage({ id, tipo, pos: r.pos, fundo: r.fundo, fora: r.fora });
  const r = Encaixe.encaixar({
    largura, espaco, girar, novas, limiteMs, semente, evitar,
    aoMelhorar: (m) => {
      // manda no máximo a cada 120 ms para a tela não ficar redesenhando à toa
      const agora = Date.now();
      if (agora - ultimo > 120) { ultimo = agora; enviar(m, 'melhor'); }
    },
  });
  enviar(r, 'melhor');
  self.postMessage({ id, tipo: 'fim' });
};
