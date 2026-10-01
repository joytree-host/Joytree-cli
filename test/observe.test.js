'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { humanBytes, fmtValue, sparkline, ruleFromFlags } = require('../commands/observe');
const { startMock, runCli } = require('./helpers');

test('formatting helpers', () => {
  assert.strictEqual(humanBytes(0), '0 B');
  assert.strictEqual(humanBytes(1536), '1.5 KB');
  assert.strictEqual(humanBytes(5 * 1024 * 1024), '5.0 MB');
  assert.strictEqual(humanBytes(null), '-');
  assert.strictEqual(fmtValue(12.345, '%'), '12.35%');
  assert.strictEqual(fmtValue(250, 'ms'), '250 ms');
  assert.strictEqual(fmtValue(2048, 'bytes'), '2.0 KB');
  assert.strictEqual(fmtValue(null, 'ms'), '-');
  assert.strictEqual(sparkline([]), '');
  assert.strictEqual(sparkline([1, 1, 1]).length, 3);
  const s = sparkline([0, 5, 10]);
  assert.strictEqual(s[0], '\u2581');
  assert.strictEqual(s[2], '\u2588');
  assert.ok(sparkline(Array.from({ length: 500 }, (_, i) => i), 40).length <= 40);
});

test('ruleFromFlags validates and merges over an existing rule', () => {
  assert.deepStrictEqual(ruleFromFlags({ name: 'n', metric: 'error_rate', threshold: '5', window: '10', severity: 'critical', webhook: 'https://h.example/x' }),
    { name: 'n', metric: 'error_rate', threshold: 5, windowMinutes: 10, severity: 'critical', webhookUrl: 'https://h.example/x' });
  const merged = ruleFromFlags({ threshold: '90' }, { name: 'cpu', metric: 'cpu', op: '>', threshold: 80, webhookUrl: 'https://keep.me' });
  assert.strictEqual(merged.webhookUrl, 'https://keep.me');
  assert.strictEqual(merged.threshold, 90);
  assert.strictEqual(ruleFromFlags({ clearWebhook: true }, { webhookUrl: 'https://x' }).webhookUrl, '');
  assert.strictEqual(ruleFromFlags({ disable: true }, { enabled: true }).enabled, false);
  assert.throws(() => ruleFromFlags({ threshold: 'abc' }), /number/);
  assert.throws(() => ruleFromFlags({ window: '90' }), /1 and 60/);
  assert.throws(() => ruleFromFlags({ severity: 'meh' }), /severity/);
  assert.throws(() => ruleFromFlags({ webhook: 'http://insecure' }), /https/);
  assert.throws(() => ruleFromFlags({ metric: 'bogus' }), /Unknown metric/);
  assert.throws(() => ruleFromFlags({ op: '=' }), /--op/);
});

test('CLI: observe summary / resources / series / cache', async () => {
  const mock = await startMock({
    'GET /api/observability/summary': () => ({ ok: true, totals: { requests: 1200, errors: 3, bytes_out: 2048 }, byProject: [{ name: 'my-app', subdomain: 'my-app', requests: 1200, errors: 3, errorRate: 0.25, p95: 180, cacheHitRate: 71 }] }),
    'GET /api/observability/resources': () => ({ ok: true, resources: [{ key: 'project:p1', kind: 'project', name: 'my-app', running: true, cpu: 3.2, memUsed: 52428800, memLimit: 268435456, uptimePct: 99.9 }, { key: 'database:d1', kind: 'database', engine: 'postgres', name: 'db', running: false }] }),
    'GET /api/observability/series': () => ({ ok: true, label: 'p95 latency', unit: 'ms', points: [{ t: 1, v: 100 }, { t: 2, v: 300 }, { t: 3, v: 200 }], summary: { min: 100, max: 300, avg: 200, last: 200 } }),
    'GET /api/observability/cache': () => ({ ok: true, cacheStatus: { HIT: 90, MISS: 10 }, missingAssets: [{ project: 'my-app', path: '/big.js', hits: 1, misses: 7, bypasses: 0 }] }),
  });
  try {
    let r = await runCli(['observe', 'summary', '--range', '7d', '--project', 'my-app'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests[0].query, { range: '7d', project: 'my-app' });
    assert.match(r.out, /my-app/); assert.match(r.out, /1200/); assert.match(r.out, /2\.0 KB/);
    r = await runCli(['observe', 'resources'], { url: mock.url });
    assert.match(r.out, /project:p1/); assert.match(r.out, /50\.0 MB \/ 256 MB/); assert.match(r.out, /stopped/);
    r = await runCli(['observe', 'series', 'latency_p95', '--range', '1h'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /p95 latency/); assert.match(r.out, /last.*200 ms/);
    r = await runCli(['observe', 'series', 'cpu'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /--resource/);
    r = await runCli(['observe', 'series', 'bogus'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    r = await runCli(['observe', 'cache'], { url: mock.url });
    assert.match(r.out, /\/big\.js/);
  } finally { await mock.close(); }
});

test('CLI: observe requests lists rows, groups, and picks the right endpoint', async () => {
  const mock = await startMock({
    'GET /api/observability/requests': () => ({ ok: true, total: 1, truncated: true, rows: [{ t: Date.now(), project: 'my-app', method: 'GET', path: '/api/x', status: 500, ms: 900, bytes: 100, cache: 'MISS', country: 'US' }] }),
    'GET /api/observability/query': () => ({ ok: true, groups: [{ key: '/api/x', count: 10, errors: 4, error_rate: 40, avg_ms: 500, p95_ms: 900, bytes: 1 }] }),
  });
  try {
    let r = await runCli(['observe', 'requests', '--status', '5xx', '--sort', 'duration', '--min-ms', '500'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests[0].query, { status: '5xx', minMs: '500', sort: 'duration' });
    assert.match(r.out, /500/); assert.match(r.out, /most recent requests/);
    r = await runCli(['observe', 'requests', '--group-by', 'path', '--metric', 'errors'], { url: mock.url });
    const q = mock.requests.find(x => x.path === '/api/observability/query');
    assert.deepStrictEqual(q.query, { groupBy: 'path', metric: 'errors' });
    assert.match(r.out, /\/api\/x/);
  } finally { await mock.close(); }
});

test('CLI: alert add / update (keeps webhook) / delete', async () => {
  const stored = { id: 'ru_1', name: 'High CPU', metric: 'cpu', op: '>', threshold: 80, windowMinutes: 5, severity: 'warning', enabled: true, target: 'all', webhookUrl: 'https://hooks.example/abc' };
  const mock = await startMock({
    'POST /api/observability/rules': (b) => ({ ok: true, item: { ...b, id: 'ru_new' } }),
    'GET /api/observability/rules': () => ({ ok: true, items: [stored] }),
    'PUT /api/observability/rules/ru_1': () => ({ ok: true }),
    'DELETE /api/observability/rules/ru_1': () => ({ ok: true }),
  });
  try {
    let r = await runCli(['observe', 'alert', 'add', '--name', 'Errors', '--metric', 'error_rate', '--threshold', '5', '--severity', 'critical'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests[0].body, { name: 'Errors', metric: 'error_rate', threshold: 5, severity: 'critical' });
    r = await runCli(['observe', 'alert', 'add', '--name', 'x', '--metric', 'cpu'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /--threshold/);
    r = await runCli(['observe', 'alert', 'update', 'High CPU', '--threshold', '90'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    const put = mock.requests.find(q => q.method === 'PUT').body;
    assert.strictEqual(put.threshold, 90);
    assert.strictEqual(put.webhookUrl, 'https://hooks.example/abc', 'an update must not wipe the webhook');
    assert.strictEqual(put.metric, 'cpu');
    r = await runCli(['observe', 'alert', 'update', 'ru_1', '--clear-webhook'], { url: mock.url });
    assert.strictEqual(mock.requests.filter(q => q.method === 'PUT').pop().body.webhookUrl, '');
    r = await runCli(['observe', 'alert', 'delete', 'ru_1', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    r = await runCli(['observe', 'alert', 'delete', 'nope', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 1);
  } finally { await mock.close(); }
});

test('CLI: metrics, rollback and cdn', async () => {
  const mock = await startMock({
    'GET /api/projects/my-app/metrics': () => ({ ok: true, status: 'running', cpu: '2.1%', memory: '40MB' }),
    'POST /api/deployments/dep_9/rollback': () => ({ ok: true, deployId: 'dep_10', message: 'Rollback started.' }),
    'GET /api/projects/my-app/cdn/status': () => ({ ok: true, enabled: true }),
    'POST /api/projects/my-app/cdn/toggle': () => ({ ok: true }),
    'POST /api/projects/my-app/cdn/purge': () => ({ ok: true, purged: 'my-app.joytree.site' }),
  });
  try {
    let r = await runCli(['metrics', 'my-app'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out); assert.match(r.out, /2\.1%/);
    r = await runCli(['rollback', 'dep_9', '--yes'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out); assert.match(r.out, /dep_10/);
    r = await runCli(['rollback', 'dep_9'], { url: mock.url, stdin: 'n\n' });
    assert.strictEqual(mock.requests.filter(q => q.path.endsWith('/rollback')).length, 1, 'declining must not roll back');
    r = await runCli(['cdn', 'my-app', 'status'], { url: mock.url });
    assert.match(r.out, /on/);
    r = await runCli(['cdn', 'my-app', 'off'], { url: mock.url });
    assert.deepStrictEqual(mock.requests.find(q => q.path.endsWith('/toggle')).body, { enabled: false });
    r = await runCli(['cdn', 'my-app', 'purge'], { url: mock.url });
    assert.match(r.out, /my-app\.joytree\.site/);
    const before = mock.requests.length;
    r = await runCli(['cdn', 'my-app', 'bogus'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.strictEqual(mock.requests.length, before);
  } finally { await mock.close(); }
});

test('CLI: deployments list shows ids and short commit for rollback', async () => {
  const mock = await startMock({ 'GET /api/workspace': () => ({ deployments: [{ id: 'dep_9', subdomain: 'my-app', status: 'success', branch: 'main', triggerSha: 'abcdef1234567', startedAt: Date.now() }] }) });
  try {
    const r = await runCli(['deployments', 'my-app'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.match(r.out, /id: dep_9/); assert.match(r.out, /commit: abcdef1/);
  } finally { await mock.close(); }
});
