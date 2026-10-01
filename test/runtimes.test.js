'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { RUNTIMES, VARIANTS, PRESET_RUNTIME, normalizeRuntime, versionField } = require('../lib/runtimes');
const { parseDeployFlags } = require('../commands/deploy');
const { startMock, runCli } = require('./helpers');

test('every wizard variant and preset runtime is a value the server knows', () => {
  for (const list of Object.values(VARIANTS)) for (const v of list) assert.ok(RUNTIMES.includes(v.val), v.val);
  for (const rt of Object.values(PRESET_RUNTIME)) assert.ok(rt === '' || RUNTIMES.includes(rt), rt);
  assert.strictEqual(RUNTIMES.length, 25);
});

test('normalizeRuntime: canonical values and plain names; unknown values throw', () => {
  for (const rt of RUNTIMES) assert.strictEqual(normalizeRuntime(rt), rt);
  const cases = { Django: 'python-django', laravel: 'php-laravel', rails: 'ruby-rails', python: 'python-generic', go: 'go-generic', 'C#': 'dotnet', phoenix: 'elixir-phoenix', nextjs: 'node-nextjs', kotlin: 'kotlin-spring', actix: 'rust-actix' };
  for (const [k, v] of Object.entries(cases)) assert.strictEqual(normalizeRuntime(k), v, k);
  assert.strictEqual(normalizeRuntime(''), '');
  assert.throws(() => normalizeRuntime('cobol'), /Unknown runtime "cobol"/);
  assert.throws(() => normalizeRuntime('python-rails'), /Unknown runtime/);
});

test('versionField maps a runtime to the server version pin', () => {
  assert.strictEqual(versionField('python-django'), 'pythonVer');
  assert.strictEqual(versionField('go-gin'), 'goVer');
  assert.strictEqual(versionField('php-laravel'), 'phpVer');
  assert.strictEqual(versionField('ruby-rails'), 'rubyVer');
  assert.strictEqual(versionField('kotlin-spring'), 'javaVer');
  assert.strictEqual(versionField('java-quarkus'), 'javaVer');
  assert.strictEqual(versionField('dotnet'), 'dotnetVer');
  for (const none of ['node', 'bun', 'deno', 'rust-axum', 'elixir-phoenix']) assert.strictEqual(versionField(none), '');
});

test('parseDeployFlags: --runtime is normalized, --runtime-version needs a runtime', () => {
  assert.deepStrictEqual(parseDeployFlags({ runtime: 'django', runtimeVersion: '3.12' }).extras, { runtime: 'python-django', pythonVer: '3.12' });
  assert.throws(() => parseDeployFlags({ runtime: 'cobol' }), /Unknown runtime/);
  assert.throws(() => parseDeployFlags({ runtimeVersion: '3.12' }), /needs --runtime/);
  assert.throws(() => parseDeployFlags({ runtime: 'bun', runtimeVersion: '1' }), /does not apply/);
  assert.strictEqual(parseDeployFlags({ runtime: 'deno' }).active, true);
});

test('CLI: deploy --runtime django --runtime-version sends canonical runtime and pin', async () => {
  const mock = await startMock({ 'POST /api/deploy': () => ({ ok: true, deployId: 'd1' }) });
  try {
    await runCli(['deploy', '--repo', 'https://github.com/a/site', '--name', 'site', '--runtime', 'django', '--runtime-version', '3.12', '--yes'],
      { url: mock.url, until: () => mock.requests.some(q => q.path === '/api/deploy') });
    const b = mock.requests.find(q => q.path === '/api/deploy').body;
    assert.strictEqual(b.runtime, 'python-django');
    assert.strictEqual(b.pythonVer, '3.12');
    assert.strictEqual(b.siteType, 'server');
  } finally { await mock.close(); }
});

test('CLI: an unknown --runtime fails before any request', async () => {
  const mock = await startMock();
  try {
    const r = await runCli(['deploy', '--repo', 'https://github.com/a/site', '--runtime', 'cobol', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /Unknown runtime/);
    assert.strictEqual(mock.requests.length, 0);
  } finally { await mock.close(); }
});

// Wizard: framework list order is auto, static, vite, react-cra, nextjs, nuxt, node, nestjs, bun, deno,
// python, go, rust, java, dotnet, php, ruby, elixir (numbers 1-18).
async function wizard(answers, expect) {
  const mock = await startMock({ 'POST /api/deploy': () => ({ ok: true, deployId: 'd1' }) });
  try {
    await runCli(['deploy', '--repo', 'https://github.com/a/app', '--name', 'app', '--branch', 'main'],
      { url: mock.url, stdin: answers, timeoutMs: 20000, until: () => mock.requests.some(q => q.path === '/api/deploy') });
    const q = mock.requests.find(x => x.path === '/api/deploy');
    assert.ok(q, 'wizard produced a deploy request');
    expect(q.body);
  } finally { await mock.close(); }
}

test('wizard: Bun and Deno now send their runtime (they are not auto-detected server-side)', async () => {
  await wizard(['9', '', ''], b => { assert.strictEqual(b.runtime, 'bun'); assert.strictEqual(b.siteType, 'server'); });
  await wizard(['10', '', ''], b => assert.strictEqual(b.runtime, 'deno'));
  await wizard(['15', '', ''], b => assert.strictEqual(b.runtime, 'dotnet'));
});

test('wizard: language choices ask for the framework and send the matching runtime', async () => {
  await wizard(['11', '1', '', ''], b => assert.strictEqual(b.runtime, 'python-django'));
  await wizard(['12', '2', '', ''], b => assert.strictEqual(b.runtime, 'go-gin'));
  await wizard(['16', '1', '', ''], b => assert.strictEqual(b.runtime, 'php-laravel'));
  await wizard(['17', '2', '', ''], b => { assert.strictEqual(b.runtime, 'ruby-sinatra'); assert.strictEqual(b.startCmd, ''); });
  await wizard(['18', '1', '', ''], b => assert.strictEqual(b.runtime, 'elixir-phoenix'));
});

test('wizard: Next.js records node-nextjs; Auto-detect sends no runtime', async () => {
  await wizard(['5', '', ''], b => assert.strictEqual(b.runtime, 'node-nextjs'));
  await wizard(['1', ''], b => assert.ok(!b.runtime, 'auto-detect must leave runtime blank'));
});
