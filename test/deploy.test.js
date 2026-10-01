'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseDeployFlags, storedDeployFields } = require('../commands/deploy');
const { startMock, runCli } = require('./helpers');

test('parseDeployFlags: worker / dockerfile / port / env', () => {
  let r = parseDeployFlags({ worker: true, start: 'node w.js', env: ['A=1', 'B=x=y'] });
  assert.deepStrictEqual(r.extras, { isWorker: true, envVars: { A: '1', B: 'x=y' } });
  assert.strictEqual(r.active, true);
  r = parseDeployFlags({ dockerfile: true, port: '8080', dockerCmd: 'node s.js' });
  assert.deepStrictEqual(r.extras, { isDockerfileDeploy: true, dockerfilePath: 'Dockerfile', dockerCommand: 'node s.js', exposedPort: 8080 });
  r = parseDeployFlags({ dockerfile: 'api/Dockerfile.prod' });
  assert.strictEqual(r.extras.dockerfilePath, 'api/Dockerfile.prod');
  r = parseDeployFlags({ env: [] });
  assert.strictEqual(r.active, false, 'no flags -> wizard still runs');
  r = parseDeployFlags({ env: ['A=1'] });
  assert.strictEqual(r.active, false, 'env alone does not skip the wizard');
});

test('parseDeployFlags: rejects invalid combinations and values', () => {
  assert.throws(() => parseDeployFlags({ worker: true }), /--start/);
  assert.throws(() => parseDeployFlags({ worker: true, start: 'x', static: true }), /static/);
  assert.throws(() => parseDeployFlags({ worker: true, start: 'x', dockerfile: true }), /--dockerfile/);
  assert.throws(() => parseDeployFlags({ port: '0' }), /--port/);
  assert.throws(() => parseDeployFlags({ port: 'abc' }), /--port/);
  assert.throws(() => parseDeployFlags({ env: ['NOEQUALS'] }), /KEY=VALUE/);
  assert.throws(() => parseDeployFlags({ env: ['1BAD=x'] }), /KEY=VALUE/);
});

test('storedDeployFields keeps worker/dockerfile settings for redeploys', () => {
  assert.deepStrictEqual(storedDeployFields({ isWorker: true, runtime: 'python', pythonVer: '3.12', exposedPort: 3000 }),
    { runtime: 'python', pythonVer: '3.12', isWorker: true, isDockerfileDeploy: false, exposedPort: 3000 });
  const d = storedDeployFields({ isDockerfileDeploy: true, dockerfilePath: 'api/Dockerfile', exposedPort: 8080, dockerCommand: 'node x' });
  assert.strictEqual(d.dockerfilePath, 'api/Dockerfile');
  assert.strictEqual(d.isDockerfileDeploy, true);
  assert.strictEqual(d.dockerCommand, 'node x');
  assert.deepStrictEqual(storedDeployFields({}), { isWorker: false, isDockerfileDeploy: false });
});

test('CLI: deploy --worker sends worker fields as one non-interactive request', async () => {
  const mock = await startMock({ 'POST /api/deploy': () => ({ ok: true, deployId: 'd1' }) });
  try {
    const r = await runCli(['deploy', '--repo', 'https://github.com/a/w', '--name', 'queue-worker', '--worker', '--start', 'node worker.js', '--env', 'QUEUE=jobs', '--yes'],
      { url: mock.url, until: () => mock.requests.some(q => q.path === '/api/deploy') });
    const q = mock.requests.find(x => x.path === '/api/deploy');
    assert.ok(q, 'deploy request was sent\n' + r.out);
    assert.strictEqual(q.auth, 'Bearer jtk_test');
    assert.strictEqual(q.body.isWorker, true);
    assert.strictEqual(q.body.siteType, 'server');
    assert.strictEqual(q.body.outputDir, '.');
    assert.strictEqual(q.body.startCmd, 'node worker.js');
    assert.deepStrictEqual(q.body.envVars, { QUEUE: 'jobs' });
    assert.strictEqual(q.body.subdomain, 'queue-worker');
  } finally { await mock.close(); }
});

test('CLI: deploy --dockerfile sends Dockerfile fields', async () => {
  const mock = await startMock({ 'POST /api/deploy': () => ({ ok: true, deployId: 'd2' }) });
  try {
    await runCli(['deploy', '--repo', 'https://github.com/a/api', '--name', 'api', '--dockerfile', 'docker/Dockerfile', '--port', '8080', '--pre-deploy', 'npm run migrate', '--yes'],
      { url: mock.url, until: () => mock.requests.some(q => q.path === '/api/deploy') });
    const b = mock.requests.find(x => x.path === '/api/deploy').body;
    assert.strictEqual(b.isDockerfileDeploy, true);
    assert.strictEqual(b.dockerfilePath, 'docker/Dockerfile');
    assert.strictEqual(b.exposedPort, 8080);
    assert.strictEqual(b.preDeployCommand, 'npm run migrate');
    assert.ok(!b.isWorker);
  } finally { await mock.close(); }
});

test('CLI: invalid flags fail fast with no API call', async () => {
  const mock = await startMock();
  try {
    const r = await runCli(['deploy', '--repo', 'https://github.com/a/w', '--worker', '--yes'], { url: mock.url });
    assert.notStrictEqual(r.code, 0);
    assert.match(r.out, /--start/);
    assert.strictEqual(mock.requests.length, 0);
  } finally { await mock.close(); }
});

test('CLI: redeploy of a worker project keeps it a worker', async () => {
  const proj = { id: 'p1', name: 'queue-worker', subdomain: 'queue-worker', repoUrl: 'https://github.com/a/w', branch: 'main', startCommand: 'node worker.js', isWorker: true, runtime: 'node', exposedPort: 3000, siteType: 'server' };
  const mock = await startMock({
    'GET /api/v1/projects': () => ({ ok: true, projects: [proj] }),
    'POST /api/deploy': () => ({ ok: true, deployId: 'd3' }),
  });
  try {
    await runCli(['redeploy', 'queue-worker'], { url: mock.url, until: () => mock.requests.some(q => q.path === '/api/deploy') });
    const b = mock.requests.find(x => x.path === '/api/deploy').body;
    assert.strictEqual(b.isWorker, true, 'redeploy must not reset worker mode');
    assert.strictEqual(b.runtime, 'node');
    assert.strictEqual(b.startCmd, 'node worker.js');
  } finally { await mock.close(); }
});
