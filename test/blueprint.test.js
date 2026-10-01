'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeGitUrl, parseEnvOverrides, parseRenames, missingEnv } = require('../commands/blueprint');
const { startMock, runCli } = require('./helpers');

const spec = {
  name: 'shop',
  services: [
    { name: 'web', type: 'static', declaredType: 'static', subdomain: 'shop-web', nameAvailable: true, requiredEnv: [], env: {} },
    { name: 'api', type: 'web', declaredType: 'web', runtime: 'node', subdomain: 'shop-api', nameAvailable: true, startCmd: 'node server.js',
      requiredEnv: ['STRIPE_KEY', 'CORS_ORIGIN', 'MODE'], env: { MODE: 'prod' } },
    { name: 'jobs', type: 'worker', declaredType: 'worker', isDockerfileDeploy: true, dockerfilePath: 'jobs/Dockerfile', requiredEnv: [], env: {} },
  ],
  databases: [{ name: 'db', engine: 'postgres', memory: '256m', linkTo: ['api'] }],
};
const okPlan = { ok: true, errors: [], warnings: [], spec, blueprintPath: 'joytree.joy' };

test('normalizeGitUrl handles ssh and https remotes', () => {
  assert.strictEqual(normalizeGitUrl('git@github.com:a/b.git'), 'https://github.com/a/b');
  assert.strictEqual(normalizeGitUrl('https://github.com/a/b.git/'), 'https://github.com/a/b');
  assert.strictEqual(normalizeGitUrl(''), '');
});

test('parseEnvOverrides / parseRenames', () => {
  assert.deepStrictEqual(parseEnvOverrides(['api.KEY=a=b', 'api.X=1', 'web.Y=2']), { api: { KEY: 'a=b', X: '1' }, web: { Y: '2' } });
  assert.throws(() => parseEnvOverrides(['KEY=1']), /SERVICE\.KEY/);
  assert.throws(() => parseEnvOverrides(['api.1bad=1']), /SERVICE\.KEY/);
  assert.deepStrictEqual(parseRenames(['a=b', 'c=d']), { a: 'b', c: 'd' });
  assert.throws(() => parseRenames(['nope'], '--rename-db'), /--rename-db/);
});

test('missingEnv skips overridden, defaulted and auto-filled CORS values', () => {
  // CORS_ORIGIN is auto-filled because the blueprint has a static site; MODE has a default.
  assert.deepStrictEqual(missingEnv(spec, {}), [{ service: 'api', key: 'STRIPE_KEY' }]);
  assert.deepStrictEqual(missingEnv(spec, { api: { STRIPE_KEY: 'sk' } }), []);
  const noStatic = { services: [{ ...spec.services[1] }], databases: [] };
  assert.deepStrictEqual(missingEnv(noStatic, { api: { STRIPE_KEY: 'sk' } }), [{ service: 'api', key: 'CORS_ORIGIN' }]);
});

test('CLI: blueprint plan sends repo/branch/file and prints the plan', async () => {
  const mock = await startMock({ 'POST /api/blueprints/plan': () => okPlan });
  try {
    const r = await runCli(['blueprint', 'plan', '--repo', 'git@github.com:a/shop.git', '--branch', 'dev', '--file', 'infra/joytree.joy'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests[0].body, { repoUrl: 'https://github.com/a/shop', branch: 'dev', blueprintPath: 'infra/joytree.joy' });
    assert.match(r.out, /Services/);
    assert.match(r.out, /jobs/);
    assert.match(r.out, /Dockerfile jobs\/Dockerfile/);
    assert.match(r.out, /postgres/);
    assert.match(r.out, /STRIPE_KEY/);
  } finally { await mock.close(); }
});

test('CLI: blueprint plan exits non-zero and shows errors for an invalid file', async () => {
  const mock = await startMock({ 'POST /api/blueprints/plan': () => ({ ok: false, errors: ['Service "api": "type" is required'], warnings: [], spec: { services: [], databases: [] } }) });
  try {
    const r = await runCli(['blueprint', 'plan', '--repo', 'https://github.com/a/shop'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /"type" is required/);
  } finally { await mock.close(); }
});

test('CLI: blueprint deploy plans first, then deploys with overrides', async () => {
  const mock = await startMock({
    'POST /api/blueprints/plan': () => okPlan,
    'POST /api/blueprints/deploy': () => ({ ok: true, warnings: [], resources: [
      { kind: 'service', name: 'api', type: 'web', ok: true },
      { kind: 'database', name: 'db', engine: 'postgres', ok: true } ] }),
  });
  try {
    const r = await runCli(['blueprint', 'deploy', '--repo', 'https://github.com/a/shop', '--env', 'api.STRIPE_KEY=sk_test', '--rename-service', 'api=shop-api-2', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.map(q => q.path), ['/api/blueprints/plan', '/api/blueprints/deploy']);
    const b = mock.requests[1].body;
    assert.deepStrictEqual(b.envOverrides, { api: { STRIPE_KEY: 'sk_test' } });
    assert.deepStrictEqual(b.serviceNameOverrides, { api: 'shop-api-2' });
    assert.strictEqual(b.databaseNameOverrides, undefined);
    assert.match(r.out, /Blueprint deployed/);
  } finally { await mock.close(); }
});

test('CLI: blueprint deploy refuses to start when values are missing (non-interactive)', async () => {
  const mock = await startMock({ 'POST /api/blueprints/plan': () => okPlan, 'POST /api/blueprints/deploy': () => ({ ok: true, resources: [] }) });
  try {
    const r = await runCli(['blueprint', 'deploy', '--repo', 'https://github.com/a/shop', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /api\.STRIPE_KEY/);
    assert.ok(!mock.requests.some(q => q.path === '/api/blueprints/deploy'), 'must not deploy with missing values');
  } finally { await mock.close(); }
});

test('CLI: blueprint deploy reports partially failed resources and exits 1', async () => {
  const mock = await startMock({
    'POST /api/blueprints/plan': () => ({ ...okPlan, spec: { ...spec, services: [spec.services[2]], databases: [] } }),
    'POST /api/blueprints/deploy': () => ({ ok: false, warnings: [], resources: [{ kind: 'service', name: 'jobs', type: 'worker', ok: false, error: 'Plan limit reached' }] }),
  });
  try {
    const r = await runCli(['blueprint', 'deploy', '--repo', 'https://github.com/a/shop', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /Plan limit reached/);
  } finally { await mock.close(); }
});

test('CLI: blueprint browse lists entries and marks the Blueprint file', async () => {
  const mock = await startMock({ 'POST /api/blueprints/browse': () => ({ ok: true, entries: [
    { name: 'infra', path: 'infra', type: 'dir' }, { name: 'joytree.joy', path: 'joytree.joy', type: 'file' }, { name: 'README.md', path: 'README.md', type: 'file' } ] }) });
  try {
    const r = await runCli(['blueprint', 'browse', 'infra', '--repo', 'https://github.com/a/shop'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(mock.requests[0].body.dir, 'infra');
    assert.match(r.out, /infra\//);
    assert.match(r.out, /joytree\.joy.*Blueprint/);
  } finally { await mock.close(); }
});
