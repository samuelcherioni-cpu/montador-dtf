// Abre a Fila DTF com o servidor (pedidos e PIN) localmente, como na Cloudflare:
//   node testes/servidor-local.js   ->  http://localhost:8790
// Usa o .dev.vars (só valores de teste, nunca vai para o GitHub) e um Google Drive falso (testes/google-falso.js).
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const raiz = path.join(__dirname, '..');
const wrangler = path.join(raiz, '..', 'ferramentas', 'wrangler', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const falso = spawn(process.execPath, [path.join(__dirname, 'google-falso.js')], { stdio: 'inherit' });
const p = spawn(process.execPath, [wrangler, 'pages', 'dev', 'site', '--port', '8790', '--ip', '127.0.0.1'], { cwd: raiz, stdio: 'inherit' });
p.on('exit', (c) => { falso.kill(); process.exit(c || 0); });
