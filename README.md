# Fila DTF — Zavari & Vantti

Página para montar a fila de DTF: o cliente adiciona PNGs transparentes, escolhe tamanho e quantidade, o sistema encaixa tudo no filme de 57 cm e gera um PNG 300 DPI pronto para impressão.

- Tudo roda no navegador. As artes nunca saem do aparelho de quem usa; não há servidor, conta ou chave.
- Este repositório é público e independente: não tem ligação com nenhum outro sistema da empresa.

## Pastas
- `site/` — o que vai ao ar (index.html, estilo.css, montador.js, encaixe.js, png.js, brilho.js, logos).
- `testes/` — testes do encaixe e do gerador de PNG, e um servidor local (`node testes/servir.js` → http://localhost:5180).
- `checar-isolamento.js` — barra a publicação se aparecer endereço interno, chave ou chamada de rede em `site/`.

## Publicar
Enviou para `main`, o robô `.github/workflows/publicar.yml` roda a checagem e os testes e publica `site/` no GitHub Pages.
Configuração única: Settings → Pages → Source: **GitHub Actions**.

## Antes de enviar
```
node checar-isolamento.js
node testes/teste-encaixe.js
node testes/teste-png.js
```
