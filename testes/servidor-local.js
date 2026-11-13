// Abre a Fila DTF com o servidor (pedidos e PIN) localmente, como na Cloudflare:
//   node testes/servidor-local.js   ->  http://localhost:8790
// Usa o .dev.vars (só valores de teste, nunca vai para o GitHub) e um armazenamento de pedidos simulado.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const raiz = path.join(__dirname, '..');
const wrangler = path.join(raiz, '..', 'ferramentas', 'wrangler', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const p = spawn(process.execPath, [wrangler, 'pages', 'dev', 'site', '--r2', 'PEDIDOS', '--port', '8790', '--ip', '127.0.0.1'], { cwd: raiz, stdio: 'inherit' });
p.on('exit', (c) => process.exit(c || 0));
