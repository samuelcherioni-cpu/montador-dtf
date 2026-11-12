// node checar-isolamento.js — confere que nada do que vai ao ar (pasta site/) aponta para outros sistemas internos
// e que não há chave nem segredo. Qualquer ocorrência barra a publicação.
'use strict';
const fs = require('fs');
const path = require('path');

const PROIBIDOS = [
  /vanttiwear/i, /zavariprime/i, /pages\.dev/i, /script\.google/i, /googleusercontent/i, /docs\.google/i,
  /\/api\//i, /\bhub\b/i, /\btoken\b/i, /segredo/i, /secret/i, /\bsenhas?\b/i, /password/i, /\bpin\b/i,
  /api[_-]?key/i, /postMessage/, /<iframe/i, /\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /\bimport\s*\(/,
];
// endereços externos permitidos no site: só a fonte Inter
const PERMITIDOS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

const raiz = path.join(__dirname, 'site');
let problemas = 0;
function varrer(dir) {
  for (const nome of fs.readdirSync(dir)) {
    const arq = path.join(dir, nome);
    if (fs.statSync(arq).isDirectory()) { varrer(arq); continue; }
    if (!/\.(html|css|js|json|txt|md|svg|webmanifest)$/i.test(nome)) continue;
    const linhas = fs.readFileSync(arq, 'utf8').split(/\r?\n/);
    linhas.forEach((linha, i) => {
      const onde = `${path.relative(__dirname, arq)}:${i + 1}`;
      for (const re of PROIBIDOS) if (re.test(linha)) { problemas++; console.log(`PROIBIDO ${re} em ${onde}`); }
      for (const url of linha.match(/https?:\/\/[^\s"'`)<>]+/gi) || []) {
        if (!PERMITIDOS.some((p) => url.startsWith(p))) { problemas++; console.log(`ENDEREÇO EXTERNO ${url} em ${onde}`); }
      }
    });
  }
}
varrer(raiz);
if (problemas) { console.log(problemas + ' problema(s): não publicar.'); process.exit(1); }
console.log('isolamento: nenhum endereço interno, chave ou chamada de rede no site');
