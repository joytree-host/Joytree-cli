'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseCondition, buildRule, parseSettings, describeAction } = require('../commands/firewall');
const { startMock, runCli } = require('./helpers');

// Real response shape of GET /api/projects/:id/firewall: settings live under `config`.
const fwView = (over = {}) => ({
  ok: true,
  project: { id: 'p1', name: 'My App', subdomain: 'my-app' },
  plan: 'pro',
  attack: { active: false, remainingSec: null },
  limits: { rules: 10 },
  config: {
    rules: [
      { id: 'rule_a', name: 'Block admin', enabled: true, action: { type: 'deny', status: 403 }, hits: 12 },
      { id: 'rule_b', name: 'Login limit', enabled: false, action: { type: 'rate_limit', requests: 10, windowSec: 60, onExceed: 'deny' }, hits: 0 },
      { id: 'rule_c', name: 'Geo log', enabled: true, action: { type: 'log' }, hits: 3 },
    ],
    ipBlocks: [{ id: 'ipb_1', ip: '1.2.3.4', host: '*' }, { id: 'ipb_2', ip: '5.6.7.8', host: '*' }],
    bypass: [{ id: 'byp_1', ip: '9.9.9.9', host: '*' }],
    bots: { protection: 'challenge', aiBots: 'block' },
    ddos: { sensitivity: 'medium', action: 'block', autoAttack: { enabled: true, rps: 300 } },
    managed: { owasp: { enabled: true, paranoia: 2, action: 'deny' } },
  },
  ...over,
});
const P = '/api/projects/my-app/firewall';

test('parseCondition: fields, names and list values', () => {
  assert.deepStrictEqual(parseCondition('path starts_with /admin'), { field: 'path', op: 'starts_with', value: '/admin' });
  assert.deepStrictEqual(parseCondition('country not_in US, GB'), { field: 'country', op: 'not_in', value: ['US', 'GB'] });
  assert.deepStrictEqual(parseCondition('header:x-api-key not_exists'), { field: 'header', op: 'not_exists', name: 'x-api-key' });
  assert.deepStrictEqual(parseCondition('user_agent contains Mozilla/5.0 (X11)'), { field: 'user_agent', op: 'contains', value: 'Mozilla/5.0 (X11)' });
  for (const bad of ['path', 'nope eq 1', 'path nope /x', 'header eq 1', 'path:foo eq /x', 'path eq', 'path exists yes']) {
    assert.throws(() => parseCondition(bad), Error, bad);
  }
});

test('buildRule: deny, rate_limit, redirect and validation', () => {
  const deny = buildRule({ name: 'N', action: 'deny', status: '403', message: 'no', if: ['path starts_with /admin', 'country not_in US'] });
  assert.deepStrictEqual(deny, { name: 'N', groups: [[{ field: 'path', op: 'starts_with', value: '/admin' }, { field: 'country', op: 'not_in', value: ['US'] }]], action: { type: 'deny', status: 403, message: 'no' } });
  const rl = buildRule({ name: 'R', action: 'rate_limit', requests: '10', window: '60', by: 'ip', onExceed: 'challenge', if: ['path eq /login'], disabled: true });
  assert.deepStrictEqual(rl.action, { type: 'rate_limit', requests: 10, windowSec: 60, keyBy: 'ip', onExceed: 'challenge' });
  assert.strictEqual(rl.enabled, false);
  assert.strictEqual(buildRule({ name: 'x', action: 'redirect', status: 301, location: '/new', if: ['path eq /old'] }).action.location, '/new');
  assert.deepStrictEqual(buildRule({ rule: '{"name":"j","groups":[],"action":{"type":"log"}}' }), { name: 'j', groups: [], action: { type: 'log' } });
  assert.throws(() => buildRule({ action: 'deny', if: ['path eq /x'] }), /--name/);
  assert.throws(() => buildRule({ name: 'x', if: ['path eq /x'] }), /--action/);
  assert.throws(() => buildRule({ name: 'x', action: 'explode', if: ['path eq /x'] }), /Unknown action/);
  assert.throws(() => buildRule({ name: 'x', action: 'deny' }), /--if/);
  assert.throws(() => buildRule({ name: 'x', action: 'rate_limit', if: ['path eq /x'] }), /--requests/);
  assert.throws(() => buildRule({ name: 'x', action: 'redirect', if: ['path eq /x'] }), /--location/);
  assert.throws(() => buildRule({ rule: '{bad' }), /--rule/);
});

test('parseSettings: nested keys and JSON-typed values', () => {
  assert.deepStrictEqual(parseSettings(['sensitivity=high', 'autoAttack.enabled=true', 'autoAttack.rps=250', 'aiAllow=["GPTBot"]']),
    { sensitivity: 'high', autoAttack: { enabled: true, rps: 250 }, aiAllow: ['GPTBot'] });
  assert.throws(() => parseSettings(['novalue']), /key=value/);
  assert.throws(() => parseSettings([]), /at least one/);
  assert.strictEqual(describeAction({ type: 'rate_limit', requests: 5, windowSec: 10, onExceed: 'deny' }), 'rate_limit 5/10s -> deny');
});

test('CLI: firewall show prints rules, hit counts, IPs and protections', async () => {
  const mock = await startMock({ [`GET ${P}`]: () => fwView() });
  try {
    const r = await runCli(['firewall', 'show', 'my-app'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    for (const s of ['Block admin', 'deny 403', '12 hits', 'rate_limit 10/60s', '1.2.3.4', '9.9.9.9', 'pro plan', 'paranoia 2']) assert.match(r.out, new RegExp(s.replace(/[./]/g, '\\$&')), s);
  } finally { await mock.close(); }
});

test('CLI: firewall rule add posts the built rule', async () => {
  const mock = await startMock({ [`POST ${P}/rules`]: (b) => ({ ok: true, rule: { ...b, id: 'rule_z' } }) });
  try {
    const r = await runCli(['firewall', 'rule', 'add', 'my-app', '--name', 'Block admin', '--action', 'deny', '--status', '403', '--if', 'path starts_with /admin'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests[0].body, { name: 'Block admin', groups: [[{ field: 'path', op: 'starts_with', value: '/admin' }]], action: { type: 'deny', status: 403 } });
    assert.match(r.out, /rule_z/);
  } finally { await mock.close(); }
});

test('CLI: rule disable / delete / move resolve names to ids via the real config shape', async () => {
  const mock = await startMock({
    [`GET ${P}`]: () => fwView(),
    [`PATCH ${P}/rules/rule_b`]: () => ({ ok: true }),
    [`DELETE ${P}/rules/rule_a`]: () => ({ ok: true }),
    [`POST ${P}/rules/reorder`]: () => ({ ok: true }),
  });
  try {
    let r = await runCli(['firewall', 'rule', 'enable', 'my-app', 'Login limit'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.find(q => q.method === 'PATCH').body, { enabled: true });
    r = await runCli(['firewall', 'rule', 'delete', 'my-app', 'rule_a'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    r = await runCli(['firewall', 'rule', 'move', 'my-app', 'rule_c', '--top'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/rules/reorder`).body, { ids: ['rule_c', 'rule_a', 'rule_b'] });
    r = await runCli(['firewall', 'rule', 'delete', 'my-app', 'nonexistent'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /No rule/);
  } finally { await mock.close(); }
});

test('CLI: block / unblock / bypass', async () => {
  const mock = await startMock({
    [`GET ${P}`]: () => fwView(),
    [`POST ${P}/ip-blocks`]: () => ({ ok: true }),
    [`POST ${P}/ip-blocks/delete`]: () => ({ ok: true }),
    [`POST ${P}/bypass`]: () => ({ ok: true }),
    [`POST ${P}/bypass/delete`]: () => ({ ok: true }),
  });
  try {
    let r = await runCli(['firewall', 'block', 'my-app', '203.0.113.9', '198.51.100.0/24', '--expires', '24h', '--note', 'abuse'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/ip-blocks`).body, { ips: ['203.0.113.9', '198.51.100.0/24'], note: 'abuse', expires: '24h' });
    r = await runCli(['firewall', 'unblock', 'my-app', '5.6.7.8', '8.8.8.8'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/ip-blocks/delete`).body, { ids: ['ipb_2'] });
    assert.match(r.out, /8\.8\.8\.8/);
    r = await runCli(['firewall', 'bypass', 'add', 'my-app', '10.0.0.1', '--note', 'office'], { url: mock.url });
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/bypass`).body, { ips: ['10.0.0.1'], note: 'office' });
    r = await runCli(['firewall', 'bypass', 'remove', 'my-app', '9.9.9.9'], { url: mock.url });
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/bypass/delete`).body, { ids: ['byp_1'] });
    r = await runCli(['firewall', 'unblock', 'my-app', '7.7.7.7'], { url: mock.url });
    assert.strictEqual(r.code, 1);
  } finally { await mock.close(); }
});

test('CLI: set, attack, test and events', async () => {
  const mock = await startMock({
    [`PUT ${P}/settings/ddos`]: () => ({ ok: true }),
    [`POST ${P}/attack`]: () => ({ ok: true }),
    [`POST ${P}/simulate`]: () => ({ ok: true, result: { mode: 'rule', matched: true, action: 'deny', detail: 'path starts_with /admin' } }),
    [`GET ${P}/events`]: () => ({ ok: true, events: [{ t: Date.now(), action: 'deny', source: 'custom_rule', ip: '1.2.3.4', country: 'US', method: 'GET', path: '/admin', ruleName: 'Block admin' }] }),
  });
  try {
    let r = await runCli(['firewall', 'set', 'my-app', 'ddos', 'sensitivity=high', 'autoAttack.enabled=true'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    assert.deepStrictEqual(mock.requests.find(q => q.method === 'PUT').body, { sensitivity: 'high', autoAttack: { enabled: true } });
    r = await runCli(['firewall', 'set', 'my-app', 'nonsense', 'a=1'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    r = await runCli(['firewall', 'attack', 'my-app', 'on', '--minutes', '60'], { url: mock.url });
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/attack`).body, { enabled: true, durationMin: 60 });
    const before = mock.requests.length;
    r = await runCli(['firewall', 'attack', 'my-app', 'on', '--minutes', '7'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.strictEqual(mock.requests.length, before, 'invalid minutes must not call the API');
    r = await runCli(['firewall', 'test', 'my-app', '--path', '/admin', '--ip', '1.2.3.4', '--country', 'US',
      '--rule-json', '{"name":"t","groups":[[{"field":"path","op":"starts_with","value":"/admin"}]],"action":{"type":"deny"}}'], { url: mock.url });
    assert.strictEqual(r.code, 0, r.out);
    const sim = mock.requests.find(q => q.path === `${P}/simulate`).body;
    assert.deepStrictEqual(sim.request, { path: '/admin', ip: '1.2.3.4', country: 'US' });
    assert.strictEqual(sim.rule.name, 't');
    assert.match(r.out, /MATCH/);
    r = await runCli(['firewall', 'events', 'my-app', '--action', 'deny', '--limit', '20'], { url: mock.url });
    assert.deepStrictEqual(mock.requests.find(q => q.path === `${P}/events`).query, { action: 'deny', limit: '20' });
    assert.match(r.out, /Block admin/);
  } finally { await mock.close(); }
});

test('CLI: server errors (e.g. plan limits) are shown and exit non-zero', async () => {
  const mock = await startMock({ [`GET ${P}`]: () => ({ __status: 403, error: 'The firewall is available on the Pro plan and above.' }) });
  try {
    const r = await runCli(['fw', 'show', 'my-app'], { url: mock.url });
    assert.strictEqual(r.code, 1);
    assert.match(r.out, /Pro plan/);
  } finally { await mock.close(); }
});
