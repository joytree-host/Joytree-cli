'use strict';

// joytree firewall ... -- per-project firewall (Pro plan and above):
// custom rules, IP block / bypass lists, bot / DDoS / OWASP settings,
// Attack Mode, a request simulator, and analytics / events / insights.

const fs = require('fs');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

const FIELDS = ['path', 'query', 'query_param', 'method', 'host', 'ip', 'country', 'user_agent', 'referer', 'header', 'cookie', 'scheme', 'client'];
const NAMED_FIELDS = new Set(['header', 'cookie', 'query_param']);
const OPS = ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'ends_with', 'matches', 'in', 'not_in', 'exists', 'not_exists'];
const NO_VALUE_OPS = new Set(['exists', 'not_exists']);
const LIST_OPS = new Set(['in', 'not_in']);
const ACTIONS = ['log', 'deny', 'challenge', 'bypass', 'rate_limit', 'redirect'];

function requireLogin() {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }
}
const base = (project) => `/api/projects/${encodeURIComponent(project)}/firewall`;
function fail(err, what) {
  ui.error(`${what}: ${err.message}`);
  process.exit(1);
}

// "path starts_with /admin" | "country not_in US,GB" | "header:x-key not_exists"
function parseCondition(text) {
  const m = String(text).trim().match(/^(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/);
  if (!m) throw new Error(`Invalid condition "${text}". Use "<field> <op> <value>", e.g. "path starts_with /admin".`);
  const [, rawField, op, rawValue] = m;
  const [field, name] = rawField.split(/:(.+)/);
  if (!FIELDS.includes(field)) throw new Error(`Unknown field "${field}". Fields: ${FIELDS.join(', ')}`);
  if (!OPS.includes(op)) throw new Error(`Unknown operator "${op}". Operators: ${OPS.join(', ')}`);
  const cond = { field, op };
  if (NAMED_FIELDS.has(field)) {
    if (!name) throw new Error(`Field "${field}" needs a name, e.g. ${field}:my-name ${op} ...`);
    cond.name = name;
  } else if (name) {
    throw new Error(`Field "${field}" does not take a name ("${rawField}").`);
  }
  if (NO_VALUE_OPS.has(op)) {
    if (rawValue) throw new Error(`Operator "${op}" takes no value.`);
  } else {
    if (rawValue === undefined || rawValue === '') throw new Error(`Condition "${text}" needs a value.`);
    cond.value = LIST_OPS.has(op) ? rawValue.split(',').map(s => s.trim()).filter(Boolean) : rawValue.trim();
  }
  return cond;
}

function intOpt(v, flag) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive whole number.`);
  return n;
}

// Turn `joytree firewall rule add` flags into a rule body.
function buildRule(opts) {
  if (opts.rule) {
    let raw = String(opts.rule);
    if (raw.startsWith('@')) raw = fs.readFileSync(raw.slice(1), 'utf8');
    try { return JSON.parse(raw); } catch (e) { throw new Error(`--rule is not valid JSON: ${e.message}`); }
  }
  if (!opts.name) throw new Error('--name is required.');
  if (!opts.action) throw new Error(`--action is required (${ACTIONS.join(' | ')}).`);
  if (!ACTIONS.includes(opts.action)) throw new Error(`Unknown action "${opts.action}". Actions: ${ACTIONS.join(', ')}`);
  const conds = [].concat(opts.if || []).map(parseCondition);
  if (!conds.length) throw new Error('At least one --if "<field> <op> <value>" condition is required (or use --rule).');

  const action = { type: opts.action };
  if (opts.status !== undefined) action.status = intOpt(opts.status, '--status');
  if (opts.message) action.message = String(opts.message);
  if (opts.action === 'rate_limit') {
    if (opts.requests === undefined || opts.window === undefined) throw new Error('rate_limit needs --requests <n> and --window <seconds>.');
    action.requests = intOpt(opts.requests, '--requests');
    action.windowSec = intOpt(opts.window, '--window');
    if (opts.by) action.keyBy = opts.by;
    if (opts.headerName) action.headerName = opts.headerName;
    if (opts.onExceed) action.onExceed = opts.onExceed;
  }
  if (opts.action === 'redirect') {
    if (!opts.location) throw new Error('redirect needs --location <url or /path>.');
    action.location = opts.location;
  }
  const rule = { name: String(opts.name), groups: [conds], action };
  if (opts.description) rule.description = String(opts.description);
  if (opts.disabled) rule.enabled = false;
  return rule;
}

// "autoAttack.enabled=true" -> { autoAttack: { enabled: true } }; values are
// parsed as JSON when possible (true, 30, ["a","b"]) and kept as text otherwise.
function coerceValue(v) {
  try { return JSON.parse(v); } catch (_) { return v; }
}
function parseSettings(pairs) {
  const out = {};
  for (const pair of [].concat(pairs || [])) {
    const eq = String(pair).indexOf('=');
    if (eq < 1) throw new Error(`Invalid setting "${pair}". Use key=value, e.g. sensitivity=high or autoAttack.enabled=true.`);
    const path = String(pair).slice(0, eq).split('.');
    let cur = out;
    path.slice(0, -1).forEach(k => { cur = (cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}); });
    cur[path[path.length - 1]] = coerceValue(String(pair).slice(eq + 1));
  }
  if (!Object.keys(out).length) throw new Error('Give at least one key=value setting.');
  return out;
}

function describeAction(a = {}) {
  switch (a.type) {
    case 'deny': return `deny${a.status ? ' ' + a.status : ''}`;
    case 'rate_limit': return `rate_limit ${a.requests}/${a.windowSec}s${a.onExceed ? ' -> ' + a.onExceed : ''}`;
    case 'redirect': return `redirect${a.status ? ' ' + a.status : ''} -> ${a.location || '?'}`;
    default: return a.type || '?';
  }
}

async function fetchConfig(project) {
  const res = await api.get(base(project));
  return { raw: res, cfg: res.config || res };
}

async function resolveRuleId(project, idOrName) {
  const { cfg } = await fetchConfig(project);
  const rules = cfg.rules || [];
  const byId = rules.find(r => r.id === idOrName);
  if (byId) return byId.id;
  const byName = rules.filter(r => String(r.name || '').toLowerCase() === String(idOrName).toLowerCase());
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1) throw new Error(`More than one rule is named "${idOrName}". Use its id: ${byName.map(r => r.id).join(', ')}`);
  throw new Error(`No rule with id or name "${idOrName}". Run: joytree firewall show ${project}`);
}

// ---- show -----------------------------------------------------------------
async function show(project, opts = {}) {
  requireLogin();
  const spin = ui.spinner('Loading firewall');
  try {
    const { raw, cfg } = await fetchConfig(project);
    spin.stop();
    if (opts.json) { console.log(JSON.stringify(raw, null, 2)); return; }
    const c = ui.c;
    ui.header(`Firewall \u2014 ${(raw.project && raw.project.name) || project}${raw.plan ? `  ${c.dim}(${raw.plan} plan)${c.reset}` : ''}`);
    ui.divider();
    const att = raw.attack || {};
    console.log(`  ${c.bold}Attack Mode${c.reset}  ${att.active ? `${c.red}ON${c.reset}${att.remainingSec ? ` ${c.dim}(${Math.ceil(att.remainingSec / 60)} min left)${c.reset}` : ''}` : `${c.dim}off${c.reset}`}`);

    const rules = cfg.rules || [];
    console.log(`\n${c.bold}Rules${c.reset} ${c.dim}(${rules.length}${raw.limits && raw.limits.rules ? ' of ' + raw.limits.rules : ''}, evaluated in order)${c.reset}`);
    if (!rules.length) console.log(`  ${c.dim}none${c.reset}`);
    for (const r of rules) {
      console.log(`  ${r.enabled === false ? c.dim + '\u2717' : c.green + '\u2713'}${c.reset} ${c.dim}${r.id}${c.reset}  ${c.bold}${r.name}${c.reset}  ${c.cyan}${describeAction(r.action)}${c.reset}  ${c.dim}${r.hits || 0} hits${c.reset}`);
    }

    const blocks = cfg.ipBlocks || [];
    const bypass = cfg.bypass || [];
    const listIps = (arr) => arr.slice(0, 8).map(e => e.ip + (e.host && e.host !== '*' ? `@${e.host}` : '')).join(', ') + (arr.length > 8 ? `, +${arr.length - 8} more` : '');
    console.log(`\n${c.bold}Blocked IPs${c.reset} ${c.dim}(${blocks.length})${c.reset}  ${blocks.length ? listIps(blocks) : c.dim + 'none' + c.reset}`);
    console.log(`${c.bold}Bypass IPs${c.reset}  ${c.dim}(${bypass.length})${c.reset}  ${bypass.length ? listIps(bypass) : c.dim + 'none' + c.reset}`);

    const b = cfg.bots || {}, d = cfg.ddos || {}, o = (cfg.managed && cfg.managed.owasp) || {};
    console.log(`\n${c.bold}Protection${c.reset}`);
    console.log(`  bots    ${b.protection || 'off'}  ${c.dim}AI bots: ${b.aiBots || 'allow'}${c.reset}`);
    console.log(`  ddos    ${d.sensitivity || 'low'} / ${d.action || 'block'}  ${c.dim}auto Attack Mode: ${d.autoAttack && d.autoAttack.enabled ? `on (>${d.autoAttack.rps} req/s)` : 'off'}${c.reset}`);
    console.log(`  owasp   ${o.enabled ? `on  ${c.dim}paranoia ${o.paranoia}, ${o.action}${c.reset}` : c.dim + 'off' + c.reset}`);
    console.log();
  } catch (err) { spin.stop(); fail(err, 'Could not load firewall'); }
}

// ---- rules ------------------------------------------------------------------
async function ruleAdd(project, opts = {}) {
  requireLogin();
  let rule;
  try { rule = buildRule(opts); } catch (e) { ui.error(e.message); process.exit(1); }
  try {
    const res = await api.post(`${base(project)}/rules`, rule);
    ui.success(`Rule "${(res.rule && res.rule.name) || rule.name}" added${res.rule && res.rule.id ? ` (${res.rule.id})` : ''}.`);
    if (rule.action && ['deny', 'challenge'].includes(rule.action.type)) {
      ui.info(`Tip: test it first with ${ui.c.cyan}joytree firewall test ${project} --path ...${ui.c.reset}, or use --action log to watch before blocking.`);
    }
  } catch (err) { fail(err, 'Could not add rule'); }
}

async function ruleSetEnabled(enabled, project, idOrName) {
  requireLogin();
  try {
    const id = await resolveRuleId(project, idOrName);
    await api.patch(`${base(project)}/rules/${encodeURIComponent(id)}`, { enabled });
    ui.success(`Rule ${id} ${enabled ? 'enabled' : 'disabled'}.`);
  } catch (err) { fail(err, `Could not ${enabled ? 'enable' : 'disable'} rule`); }
}
const ruleEnable  = (p, r) => ruleSetEnabled(true, p, r);
const ruleDisable = (p, r) => ruleSetEnabled(false, p, r);

async function ruleDelete(project, idOrName) {
  requireLogin();
  try {
    const id = await resolveRuleId(project, idOrName);
    await api.delete(`${base(project)}/rules/${encodeURIComponent(id)}`);
    ui.success(`Rule ${id} deleted.`);
  } catch (err) { fail(err, 'Could not delete rule'); }
}

async function ruleMove(project, idOrName, opts = {}) {
  requireLogin();
  try {
    const { cfg } = await fetchConfig(project);
    const ids = (cfg.rules || []).map(r => r.id);
    const id = await resolveRuleId(project, idOrName);
    const from = ids.indexOf(id);
    let to;
    if (opts.to !== undefined) to = intOpt(opts.to, '--to') - 1;
    else if (opts.top) to = 0;
    else if (opts.bottom) to = ids.length - 1;
    else throw new Error('Say where to move it: --to <position>, --top or --bottom.');
    to = Math.max(0, Math.min(ids.length - 1, to));
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await api.post(`${base(project)}/rules/reorder`, { ids });
    ui.success(`Rule ${id} is now #${to + 1} of ${ids.length}.`);
  } catch (err) { fail(err, 'Could not reorder rules'); }
}

// ---- IP lists ---------------------------------------------------------------
async function ipAdd(list, project, ips, opts = {}) {
  requireLogin();
  const body = { ips, host: opts.host, note: opts.note };
  if (list === 'block') body.expires = opts.expires;
  try {
    await api.post(`${base(project)}/${list === 'block' ? 'ip-blocks' : 'bypass'}`, body);
    ui.success(`${list === 'block' ? 'Blocked' : 'Added to bypass list'}: ${ips.join(', ')}`);
  } catch (err) { fail(err, list === 'block' ? 'Could not block' : 'Could not add to bypass list'); }
}
async function ipRemove(list, project, ips) {
  requireLogin();
  try {
    const { cfg } = await fetchConfig(project);
    const entries = (list === 'block' ? cfg.ipBlocks : cfg.bypass) || [];
    const wanted = new Set(ips.map(s => String(s).trim()));
    const ids = entries.filter(e => wanted.has(e.ip)).map(e => e.id);
    const found = new Set(entries.filter(e => wanted.has(e.ip)).map(e => e.ip));
    const missing = [...wanted].filter(ip => !found.has(ip));
    if (!ids.length) { ui.error(`None of those addresses are on the ${list === 'block' ? 'block' : 'bypass'} list.`); process.exit(1); }
    await api.post(`${base(project)}/${list === 'block' ? 'ip-blocks' : 'bypass'}/delete`, { ids });
    ui.success(`Removed: ${[...found].join(', ')}`);
    if (missing.length) ui.warn(`Not on the list: ${missing.join(', ')}`);
  } catch (err) { fail(err, 'Could not remove'); }
}
const block        = (p, ips, o) => ipAdd('block', p, ips, o);
const unblock      = (p, ips) => ipRemove('block', p, ips);
const bypassAdd    = (p, ips, o) => ipAdd('bypass', p, ips, o);
const bypassRemove = (p, ips) => ipRemove('bypass', p, ips);

// ---- settings & attack mode ---------------------------------------------------
const SECTIONS = ['bots', 'ddos', 'owasp', 'headers', 'responses'];
async function set(project, section, pairs, opts = {}) {
  requireLogin();
  if (!SECTIONS.includes(section)) { ui.error(`Unknown section "${section}". Sections: ${SECTIONS.join(', ')}`); process.exit(1); }
  let body;
  try { body = parseSettings(pairs); } catch (e) { ui.error(e.message); process.exit(1); }
  try {
    await api.put(`${base(project)}/settings/${section}`, body);
    ui.success(`Updated ${section}: ${Object.keys(body).join(', ')}`);
  } catch (err) { fail(err, `Could not update ${section}`); }
}

async function attack(project, state, opts = {}) {
  requireLogin();
  if (!['on', 'off'].includes(state)) { ui.error('Use: joytree firewall attack <project> on|off'); process.exit(1); }
  let durationMin;
  if (opts.minutes !== undefined) {
    durationMin = Number(opts.minutes);
    if (![15, 60, 360, 1440].includes(durationMin)) { ui.error('--minutes must be 15, 60, 360 or 1440.'); process.exit(1); }
  }
  try {
    await api.post(`${base(project)}/attack`, { enabled: state === 'on', durationMin });
    ui.success(state === 'on' ? `Attack Mode is ON${durationMin ? ` for ${durationMin} min` : ' until you turn it off'}.` : 'Attack Mode is off.');
  } catch (err) { fail(err, 'Could not change Attack Mode'); }
}

// ---- simulate / read-only views ---------------------------------------------
async function test(project, opts = {}) {
  requireLogin();
  const request = {};
  for (const [flag, key] of [['path', 'path'], ['method', 'method'], ['ip', 'ip'], ['country', 'country'], ['host', 'host'], ['ua', 'ua'], ['referer', 'referer'], ['scheme', 'scheme']]) {
    if (opts[flag]) request[key] = opts[flag];
  }
  let rule;
  if (opts.ruleJson) {
    try {
      let raw = String(opts.ruleJson);
      if (raw.startsWith('@')) raw = fs.readFileSync(raw.slice(1), 'utf8');
      rule = JSON.parse(raw);
    } catch (e) { ui.error(`--rule-json: ${e.message}`); process.exit(1); }
  }
  try {
    const res = await api.post(`${base(project)}/simulate`, { request, rule });
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const r = res.result || {};
    const c = ui.c;
    if (r.mode === 'rule') {
      console.log(r.matched ? `${c.yellow}Rule would MATCH${c.reset} this request -> ${c.bold}${r.action}${c.reset}` : `${c.green}Rule would not match${c.reset} this request.`);
      if (r.detail) console.log(`${c.dim}${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}${c.reset}`);
    } else {
      ui.header('Simulated decision');
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined || v === '') continue;
        ui.label(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
  } catch (err) { fail(err, 'Simulation failed'); }
}

async function events(project, opts = {}) {
  requireLogin();
  const q = new URLSearchParams();
  for (const k of ['limit', 'action', 'source', 'q']) if (opts[k]) q.set(k, opts[k]);
  try {
    const res = await api.get(`${base(project)}/events${q.toString() ? '?' + q : ''}`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const evs = res.events || [];
    if (!evs.length) { ui.info('No firewall events recorded yet.'); return; }
    const c = ui.c;
    ui.header(`Firewall events (${evs.length})`);
    for (const e of evs) {
      const t = e.t ? new Date(e.t).toLocaleTimeString() : '';
      const col = e.action === 'deny' ? c.red : e.action === 'challenge' ? c.yellow : c.dim;
      console.log(`  ${c.dim}${t}${c.reset}  ${col}${String(e.action || '').padEnd(10)}${c.reset} ${String(e.source || '').padEnd(12)} ${e.ip || '-'}${e.country ? ' ' + e.country : ''}  ${e.method || ''} ${e.path || ''}`);
      if (e.reason || e.ruleName) console.log(`      ${c.dim}${e.ruleName ? e.ruleName + ': ' : ''}${e.reason || ''}${c.reset}`);
    }
    console.log();
  } catch (err) { fail(err, 'Could not load events'); }
}

async function analytics(project, opts = {}) {
  requireLogin();
  try {
    const res = await api.get(`${base(project)}/analytics${opts.range ? '?range=' + encodeURIComponent(opts.range) : ''}`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const a = res.analytics || {};
    const c = ui.c;
    ui.header(`Firewall analytics (${a.range || opts.range || '24h'})`);
    ui.divider();
    for (const [k, v] of Object.entries(a.totals || {})) console.log(`  ${k.padEnd(12)} ${c.bold}${v}${c.reset}`);
    for (const [name, list] of Object.entries(a.tops || {})) {
      if (!Array.isArray(list) || !list.length) continue;
      console.log(`\n${c.bold}Top ${name}${c.reset}`);
      for (const item of list.slice(0, 5)) {
        const vals = Array.isArray(item) ? item : Object.values(item);
        const label = vals.find(v => typeof v === 'string') ?? '';
        const count = vals.find(v => typeof v === 'number') ?? '';
        console.log(`  ${String(count).padStart(6)}  ${label || c.dim + '(none)' + c.reset}`);
      }
    }
    console.log();
  } catch (err) { fail(err, 'Could not load analytics'); }
}

async function insights(project, opts = {}) {
  requireLogin();
  try {
    const res = await api.get(`${base(project)}/insights`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    ui.header(`Firewall insights${res.score !== undefined ? `  ${c.dim}score ${res.score}/100${c.reset}` : ''}`);
    const items = res.insights || [];
    if (!items.length) { ui.success('Nothing to flag.'); return; }
    for (const it of items) {
      const title = it.title || it.message || it.text || it.id || JSON.stringify(it);
      console.log(`  ${it.severity === 'high' || it.severity === 'critical' ? c.red : c.yellow}\u2022${c.reset} ${c.bold}${title}${c.reset}`);
      const detail = it.detail || it.description || it.body;
      if (detail) console.log(`    ${c.dim}${detail}${c.reset}`);
    }
    console.log();
  } catch (err) { fail(err, 'Could not load insights'); }
}

module.exports = {
  show, ruleAdd, ruleEnable, ruleDisable, ruleDelete, ruleMove,
  block, unblock, bypassAdd, bypassRemove, set, attack, test, events, analytics, insights,
  parseCondition, buildRule, parseSettings, coerceValue, describeAction,
};
