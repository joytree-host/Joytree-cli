'use strict';
// Test harness: a tiny mock JoyTree API plus a runner that executes the real
// CLI as a child process against it, so tests check what actually goes over HTTP.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'joytree.js');

// routes: { 'METHOD /path': (body, req) => jsonOrFn }  (path without query string)
async function startMock(routes = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      const u = new URL(req.url, 'http://x');
      const entry = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: req.headers.authorization };
      requests.push(entry);
      const handler = routes[`${req.method} ${u.pathname}`];
      const out = handler ? handler(body, entry) : { ok: true };
      res.writeHead(out && out.__status ? out.__status : 200, { 'Content-Type': 'application/json' });
      if (out && out.__status) delete out.__status;
      res.end(JSON.stringify(out));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(r => server.close(r)) };
}

// Run the CLI. Resolves with { code, out, killed } when the process exits, or
// when `until()` becomes true (then the child is killed) - needed for commands
// that poll for a long time after the request we care about.
function runCli(args, { url, until, timeoutMs = 15000, stdin = '' } = {}) {
  return new Promise((resolve) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-home-'));
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home, JOYTREE_API_KEY: 'jtk_test', JOYTREE_BASE_URL: url, NO_COLOR: '1', NO_UPDATE_NOTIFIER: '1' },
    });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    // `stdin` is a string, or an array of lines typed one after another with a
    // short pause so each interactive prompt (which opens its own readline) sees its answer.
    if (Array.isArray(stdin)) {
      stdin.forEach((line, i) => setTimeout(() => { try { child.stdin.write(line + '\n'); } catch (_) {} }, 400 * (i + 1)));
      setTimeout(() => { try { child.stdin.end(); } catch (_) {} }, 400 * (stdin.length + 2));
    } else {
      child.stdin.end(stdin);
    }
    let killed = false;
    const done = (code) => { clearInterval(iv); clearTimeout(to); resolve({ code, out, killed }); };
    const iv = setInterval(() => { if (until && until()) { killed = true; child.kill('SIGKILL'); } }, 50);
    const to = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', done);
  });
}

module.exports = { startMock, runCli };
