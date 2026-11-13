// node checar-isolamento.js — confere que nada da Fila DTF aponta para outros sistemas internos (hub,
// planilhas, domínios) e que não há chave nem segredo no que vai ao ar. Qualquer ocorrência barra a publicação.
//   site/       páginas baixadas pelo navegador do cliente
//   functions/  servidor da Fila DTF (pedidos e PIN de admin): só pode falar com o próprio armazenamento
'use strict';
const fs = require('fs');
const path = require('path');

const INTERNOS = [/vanttiwear/i, /zavariprime/i, /zavari-vantti-hub/i, /pages\.dev/i, /script\.google/i, /googleusercontent/i, /docs\.google/i, /\bhub\b/i];
const PROIBIDOS_SITE = [
  ...INTERNOS,
  /\/api\//i, /\btoken\b/i, /segredo/i, /secret/i, /\bsenhas?\b/i, /password/i,
  /api[_-]?key/i,
  // PIN escrito no código (o PIN de admin só existe como hash nos segredos da Cloudflare)
  /\bpin\b[^\n]{0,30}['"`]\d{4}['"`]/i, /['"`]\d{4}['"`][^\n]{0,30}\bpin\b/i,
  // mensagem para outra janela (moldura, aba que abriu, página de cima); MessageChannel interno da página é permitido
  /\b(?:window|parent|top|opener|self|frames)\b[^;]*\.postMessage/, /(?<![.\w])postMessage\s*\(/, /<iframe/i,
  /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /\bimport\s*\(/,
];
// o servidor pode usar os nomes dos próprios segredos, mas não pode chamar nenhum endereço de fora
const PROIBIDOS_SERVIDOR = [...INTERNOS, /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /\bpin\b[^\n]{0,30}['"`]\d{4}['"`]/i];
// endereços externos permitidos no site: a fonte Inter e o link do WhatsApp (abre a conversa com a Zavari)
const PERMITIDOS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://wa.me/'];

let problemas = 0;
function varrer(dir, regras, ehSite) {
  for (const nome of fs.readdirSync(dir)) {
    const arq = path.join(dir, nome);
    if (fs.statSync(arq).isDirectory()) { varrer(arq, regras, ehSite); continue; }
    if (!/\.(html|css|js|mjs|json|txt|md|svg|webmanifest)$/i.test(nome)) continue;
    const linhas = fs.readFileSync(arq, 'utf8').split(/\r?\n/);
    linhas.forEach((original, i) => {
      const onde = `${path.relative(__dirname, arq)}:${i + 1}`;
      let linha = original;
      // campo de digitar o PIN (esconde os números enquanto digita): não é senha escrita no código
      if (ehSite) linha = linha.replace(/type="password"/g, 'type="oculto"');
      // o trabalhador do encaixe (Web Worker) só conversa com a própria página: a resposta dele é liberada,
      // e só nesse arquivo; qualquer outra mensagem para janela continua barrada
      if (ehSite && nome === 'trabalho-encaixe.js') linha = linha.replace(/\bself\.postMessage\(/g, 'RESPOSTA_DO_TRABALHADOR(');
      // servidor.js é o único arquivo do site que fala com um servidor, e só com as rotas da própria Fila DTF
      if (ehSite && nome === 'servidor.js') {
        linha = linha.replace(/'\/api\/(admin|pedido|pedidos)'/g, "'ROTA_DA_FILA'").replace(/\bfetch\s*\(ROTAS\[/g, 'CHAMADA_DA_FILA(').replace(/new XMLHttpRequest\(\)/g, 'ENVIO_DA_FILA()');
        if (/XMLHttpRequest/.test(original) && /^\s*\/\//.test(original)) linha = linha.replace(/XMLHttpRequest/g, 'XHR');
      }
      for (const re of regras) if (re.test(linha)) { problemas++; console.log(`PROIBIDO ${re} em ${onde}`); }
      if (ehSite) for (const url of linha.match(/https?:\/\/[^\s"'`)<>]+/gi) || []) {
        if (!PERMITIDOS.some((p) => url.startsWith(p))) { problemas++; console.log(`ENDEREÇO EXTERNO ${url} em ${onde}`); }
      }
    });
  }
}
varrer(path.join(__dirname, 'site'), PROIBIDOS_SITE, true);
if (fs.existsSync(path.join(__dirname, 'functions'))) varrer(path.join(__dirname, 'functions'), PROIBIDOS_SERVIDOR, false);
if (problemas) { console.log(problemas + ' problema(s): não publicar.'); process.exit(1); }
console.log('isolamento: nenhum endereço interno, chave ou chamada de rede fora das rotas da própria Fila DTF');
