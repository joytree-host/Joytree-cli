'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../lib/watch-core');
const { startMock, runCli } = require('./helpers');

test('slugFromFilename: names, browser duplicate suffixes, odd characters', () => {
  assert.strictEqual(core.slugFromFilename('my-site.zip'), 'my-site');
  assert.strictEqual(core.slugFromFilename('My Site (2).zip'), 'my-site');
  assert.strictEqual(core.slugFromFilename('my-site - Copy.tar.gz'), 'my-site');
  assert.strictEqual(core.slugFromFilename('site-2.zip'), 'site-2', 'a real "-2" in the name is kept');
  assert.strictEqual(core.slugFromFilename('Café_Menu!!.tgz'), 'caf-menu');
  assert.strictEqual(core.slugFromFilename('landing.HTML'), 'landing');
  assert.strictEqual(core.slugFromFilename('.zip'), '');
});

test('isDeployableName ignores partial downloads, dotfiles and other types', () => {
  for (const n of ['a.zip', 'a.tar.gz', 'a.tgz', 'a.html', 'A.ZIP', 'a.htm']) assert.ok(core.isDeployableName(n), n);
  for (const n of ['a.zip.crdownload', 'a.zip.part', 'a.zip.download', '.hidden.zip', '~$a.html', 'a.png', 'a.txt', 'a.zip~', 'a.zip.tmp']) assert.ok(!core.isDeployableName(n), n);
});

test('Tracker: waits for a file to stop changing, then fires once per version', () => {
  const t = new core.Tracker({ stableMs: 1000 });
  const f = (size, m) => [{ name: 'a.zip', size, mtimeMs: m }];
  assert.deepStrictEqual(t.update(f(10, 1), 0), { ready: [], pending: 1 });
  assert.strictEqual(t.update(f(20, 2), 600).ready.length, 0, 'still growing');
  assert.strictEqual(t.update(f(20, 2), 1200).ready.length, 0, 'stable for only 600ms');
  const r = t.update(f(20, 2), 1700);
  assert.strictEqual(r.ready.length, 1);
  t.markDone('a.zip', r.ready[0].fp);
  assert.strictEqual(t.update(f(20, 2), 5000).ready.length, 0, 'handled versions do not repeat');
  t.update(f(30, 9), 6000);
  assert.strictEqual(t.update(f(30, 9), 7100).ready.length, 1, 'an updated file is picked up again');
});

test('Tracker: baseline files are not deployed, empty files never are', () => {
  const t = new core.Tracker({ stableMs: 0 });
  t.baseline([{ name: 'old.zip', size: 5, mtimeMs: 1 }]);
  assert.strictEqual(t.update([{ name: 'old.zip', size: 5, mtimeMs: 1 }], 0).ready.length, 0);
  t.update([{ name: 'e.zip', size: 0, mtimeMs: 1 }], 0);
  assert.strictEqual(t.update([{ name: 'e.zip', size: 0, mtimeMs: 1 }], 10).ready.length, 0);
});

function tmpDirWith(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-watch-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(d, n), c);
  return d;
}
const upProject = { ok: true, project: { id: 'upload_9', subdomain: 'my-site', name: 'my-site', source: 'upload', uploadProjectId: 'upload_9' } };

test('CLI watch --once: existing upload project goes through one sync-upload call', async () => {
  const dir = tmpDirWith({ 'my-site (1).zip': 'PKfakezip' });
  const mock = await startMock({
    'GET /api/v1/projects/my-site': () => upProject,
    'POST /api/projects/my-site/sync-upload': () => ({ ok: true, filesUpdated: true, redeployed: true, deployId: 'd7', liveUrl: 'https://my-site.joytree.site' }),
  });
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    const up = mock.requests.find(q => q.path === '/api/projects/my-site/sync-upload');
    assert.ok(up, 'archive sent to sync-upload');
    assert.strictEqual(up.auth, 'Bearer jtk_test');
    assert.match(String(up.body), /filename="my-site \(1\)\.zip"/);
    assert.ok(!mock.requests.some(q => q.path === '/api/upload-project' || q.path === '/api/upload-deploy'), 'no legacy two-step flow');
    assert.match(r.out, /Deploy started/);
  } finally { await mock.close(); }
});

test('CLI watch --once: identical files and queued redeploys are reported, not treated as errors', async () => {
  const dir = tmpDirWith({ 'my-site.zip': 'PK' });
  let mock = await startMock({
    'GET /api/v1/projects/my-site': () => upProject,
    'POST /api/projects/my-site/sync-upload': () => ({ ok: true, filesUpdated: false, redeployed: false, unchanged: true }),
  });
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /identical/);
  } finally { await mock.close(); }
  const dir2 = tmpDirWith({ 'my-site.zip': 'PK2' });
  mock = await startMock({
    'GET /api/v1/projects/my-site': () => upProject,
    'POST /api/projects/my-site/sync-upload': () => ({ __status: 202, ok: true, filesUpdated: true, redeployed: false, redeployQueued: true }),
  });
  try {
    const r = await runCli(['watch', dir2, '--once', '--stable', '0'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /queued/);
  } finally { await mock.close(); }
});

test('CLI watch --once: unknown name is skipped without --create, created with it', async () => {
  const dir = tmpDirWith({ 'brand-new.zip': 'PKx' });
  const routes = {
    'GET /api/v1/projects/brand-new': () => ({ __status: 404, ok: false, error: 'Project not found.' }),
    'POST /api/upload-project': () => ({ ok: true, projectId: 'x' }),
    'POST /api/upload-deploy': () => ({ ok: true, deployId: 'd1' }),
  };
  let mock = await startMock(routes);
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0'], { url: mock.url });
    assert.match(r.out, /--create/);
    assert.ok(!mock.requests.some(q => q.path === '/api/upload-project'), 'nothing uploaded');
  } finally { await mock.close(); }
  const dir2 = tmpDirWith({ 'brand-new.zip': 'PKx' });
  mock = await startMock(routes);
  try {
    const r = await runCli(['watch', dir2, '--once', '--stable', '0', '--create'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    const dep = mock.requests.find(q => q.path === '/api/upload-deploy');
    assert.ok(dep, 'upload-deploy called');
    assert.strictEqual(dep.body.subdomain, 'brand-new');
    assert.strictEqual(dep.body.name, 'brand-new');
    assert.match(dep.body.projectId, /^upload_/);
  } finally { await mock.close(); }
});

test('CLI watch --once: never overwrites a GitHub project, ignores partial downloads', async () => {
  const dir = tmpDirWith({ 'repo-site.zip': 'PK', 'big.zip.crdownload': 'xx', 'notes.txt': 'hi' });
  const mock = await startMock({
    'GET /api/v1/projects/repo-site': () => ({ ok: true, project: { id: 'p1', subdomain: 'repo-site', repoUrl: 'https://github.com/a/b', source: 'github' } }),
  });
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0'], { url: mock.url });
    assert.match(r.out, /GitHub project/);
    assert.ok(!mock.requests.some(q => q.path === '/api/upload-project'));
    assert.ok(!mock.requests.some(q => q.path.includes('big')), 'partial download ignored');
  } finally { await mock.close(); }
});

test('CLI watch --once --project sends any file to that project', async () => {
  const dir = tmpDirWith({ 'whatever-name.zip': 'PK' });
  const mock = await startMock({
    'GET /api/v1/projects/my-site': () => upProject,
    'POST /api/projects/my-site/sync-upload': () => ({ ok: true, deployId: 'd2' }),
  });
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0', '--project', 'my-site'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.ok(mock.requests.some(q => q.path === '/api/projects/my-site/sync-upload'));
  } finally { await mock.close(); }
});

test('CLI watch --create retries creating the deployment when one is already running (409)', async () => {
  const dir = tmpDirWith({ 'fresh-site.zip': 'PK' });
  let n = 0;
  const mock = await startMock({
    'GET /api/v1/projects/fresh-site': () => ({ __status: 404, ok: false, error: 'Project not found.' }),
    'POST /api/upload-project': () => ({ ok: true }),
    'POST /api/upload-deploy': () => (++n === 1 ? { __status: 409, error: 'busy' } : { ok: true, deployId: 'd3' }),
  });
  try {
    const r = await runCli(['watch', dir, '--once', '--stable', '0', '--create'], { url: mock.url, timeoutMs: 20000 });
    assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(n, 2, 'second attempt succeeded');
  } finally { await mock.close(); }
});
