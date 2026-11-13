// node ferramentas/autorizar-google.js [arquivo-da-credencial.json]
// Liga a Fila DTF ao Google Drive, uma vez só, e grava os segredos no projeto fila-dtf da Cloudflare.
//   1. lê a credencial baixada do Google Cloud (o client_secret_*.json mais novo em Downloads)
//   2. abre o navegador na tela do Google: entre com a conta do Drive dos pedidos e clique em Permitir
//   3. confere que o Drive responde
//   4. cria o projeto fila-dtf na Cloudflare se faltar e grava GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//      GOOGLE_REFRESH_TOKEN e (se digitado) PIN_ADMIN
// Nenhum valor secreto aparece na tela nem fica gravado em arquivo. Precisa do Wrangler logado
// (node ..\ferramentas\wrangler\node_modules\wrangler\bin\wrangler.js login).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { spawnSync, spawn } = require('child_process');

const PORTA = 8792, VOLTA = `http://127.0.0.1:${PORTA}/`;
const ESCOPO = 'https://www.googleapis.com/auth/drive.file';
const PROJETO = 'fila-dtf';
const WRANGLER = path.join(__dirname, '..', '..', 'ferramentas', 'wrangler', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function credencial() {
  let arq = process.argv[2];
  if (!arq) {
    const pasta = path.join(os.homedir(), 'Downloads');
    const achados = fs.readdirSync(pasta).filter((n) => /^client_secret_.*\.json$/i.test(n))
      .map((n) => path.join(pasta, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    arq = achados[0];
  }
  if (!arq || !fs.existsSync(arq)) { console.log('Não achei a credencial (client_secret_*.json) em Downloads.'); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const c = j.web || j.installed;
  if (!c || !c.client_id || !c.client_secret) { console.log('O arquivo ' + path.basename(arq) + ' não é uma credencial OAuth.'); process.exit(1); }
  console.log('Credencial: ' + path.basename(arq));
  return c;
}

function wrangler(args, entrada) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { input: entrada, encoding: 'utf8', cwd: path.join(__dirname, '..') });
  return { ok: r.status === 0, saida: (r.stdout || '') + (r.stderr || '') };
}

function perguntarOculto(pergunta) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(pergunta)) process.stdout.write(s); else process.stdout.write('*'); };
    rl.question(pergunta, (v) => { rl.close(); process.stdout.write('\n'); ok(v.trim()); });
  });
}

function esperarCodigo(c) {
  return new Promise((ok, falha) => {
    const servidor = http.createServer((req, res) => {
      const u = new URL(req.url, VOLTA);
      if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
      const codigo = u.searchParams.get('code'), erro = u.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<body style="background:#0b0b0c;color:#f2f2f3;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>${codigo ? 'Pronto. Pode fechar esta aba.' : 'Autorização recusada.'}</p></body>`);
      servidor.close();
      codigo ? ok(codigo) : falha(new Error(erro || 'sem código'));
    }).listen(PORTA, '127.0.0.1', () => {
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: c.client_id, redirect_uri: VOLTA, response_type: 'code', scope: ESCOPO,
        access_type: 'offline', prompt: 'consent',
      });
      console.log('Abrindo o Google no navegador: entre com a conta do Drive dos pedidos e clique em Permitir.');
      spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
    });
  });
}

(async () => {
  const quem = wrangler(['whoami']);
  if (!quem.ok || /not authenticated|You are not/i.test(quem.saida)) {
    console.log('O Wrangler não está logado na Cloudflare. Rode antes: node "' + WRANGLER + '" login');
    process.exit(1);
  }
  const c = credencial();
  const codigo = await esperarCodigo(c);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: codigo, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: VOLTA, grant_type: 'authorization_code' }),
  });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) { console.log('O Google não devolveu a autorização (' + r.status + ' ' + (t.error || '') + ').'); process.exit(1); }
  if (!String(t.scope || '').includes('drive.file')) { console.log('A permissão do Drive não foi marcada. Rode de novo e marque o acesso ao Drive.'); process.exit(1); }
  const teste = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)', { headers: { authorization: 'Bearer ' + t.access_token } });
  if (!teste.ok) { console.log('O Drive não respondeu (' + teste.status + '). Confira se a API do Drive está ativada no projeto.'); process.exit(1); }
  console.log('Google Drive: autorizado e respondendo.');

  const lista = wrangler(['pages', 'project', 'list']);
  if (!new RegExp('\\b' + PROJETO + '\\b').test(lista.saida)) {
    const criado = wrangler(['pages', 'project', 'create', PROJETO, '--production-branch', 'main']);
    if (!criado.ok) { console.log('Não consegui criar o projeto ' + PROJETO + ' na Cloudflare.'); process.exit(1); }
    console.log('Projeto ' + PROJETO + ' criado na Cloudflare.');
  }
  const segredos = { GOOGLE_CLIENT_ID: c.client_id, GOOGLE_CLIENT_SECRET: c.client_secret, GOOGLE_REFRESH_TOKEN: t.refresh_token };
  const pin = await perguntarOculto('PIN de admin da Fila DTF (4 dígitos; Enter para pular): ');
  if (pin) {
    if (!/^\d{4}$/.test(pin)) { console.log('O PIN precisa ter 4 dígitos. Nada foi gravado.'); process.exit(1); }
    segredos.PIN_ADMIN = pin;
  }
  for (const [nome, valor] of Object.entries(segredos)) {
    const g = wrangler(['pages', 'secret', 'put', nome, '--project-name', PROJETO], valor);
    console.log((g.ok ? 'gravado  ' : 'FALHOU   ') + nome);
    if (!g.ok) process.exit(1);
  }
  console.log('Pronto. A credencial baixada pode ser apagada de Downloads (ela já está na Cloudflare).');
})().catch((e) => { console.log('Erro: ' + e.message); process.exit(1); });
