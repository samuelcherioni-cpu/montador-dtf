// Servidor local só para testar: node testes/servir.js  →  http://localhost:5180
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', 'site');
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const arq = path.join(raiz, url === '/' ? 'index.html' : url);
  if (!arq.startsWith(raiz) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': tipos[path.extname(arq)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
}).listen(5180, () => console.log('http://localhost:5180'));
