// Brilho que segue o mouse, igual ao das Contas em Aberto: cada elemento .brilho recebe a posição do
// ponteiro em relação a ele (--gx/--gy) e a página recebe --xp (0 = esquerda, 1 = direita), que leva a cor do azul ao roxo.
(() => {
  let x = -9999, y = -9999, raf = 0;
  function atualizar() {
    raf = 0;
    document.documentElement.style.setProperty('--xp', Math.min(1, Math.max(0, x / innerWidth)).toFixed(3));
    document.querySelectorAll('.brilho').forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', (x - r.left).toFixed(1) + 'px');
      el.style.setProperty('--gy', (y - r.top).toFixed(1) + 'px');
    });
  }
  const pedir = () => { if (!raf) raf = requestAnimationFrame(atualizar); };
  document.addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; pedir(); }, { passive: true });
  document.addEventListener('scroll', pedir, { passive: true });
  document.addEventListener('pointerleave', () => { x = y = -9999; pedir(); });
})();
