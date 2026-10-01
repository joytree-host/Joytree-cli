'use strict';

// joytree observe ...  -- traffic, latency, errors, CPU/memory, cache, alerts
// joytree metrics <project> -- live container metrics
// joytree rollback <deployment-id>
// joytree cdn <project> status|on|off|purge

const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');
const { confirm } = require('../lib/prompt');

const REQUEST_METRICS = ['requests', 'errors', 'client_errors', 'error_rate', 'latency_avg', 'latency_p50', 'latency_p95', 'latency_p99', 'bytes_out', 'cache_hit_rate'];
const RESOURCE_METRICS = ['cpu', 'mem_pct', 'mem_bytes', 'net_rx', 'net_tx'];
const ALL_METRICS = REQUEST_METRICS.concat(RESOURCE_METRICS);

function requireLogin() {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }
}
function fail(err, what) { ui.error(`${what}: ${err.message}`); process.exit(1); }
function qs(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ---- formatting helpers (exported for tests) --------------------------------
function humanBytes(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-';
  let v = Number(n);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
function fmtValue(v, unit) {
  if (v === null || v === undefined) return '-';
  if (unit === 'bytes' || unit === 'B') return humanBytes(v);
  const n = typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(2)) : v;
  return unit ? `${n}${unit === '%' ? '%' : ' ' + unit}` : String(n);
}
// Down-sample to at most `width` buckets and draw with block characters.
function sparkline(values, width = 40) {
  const vals = values.filter(v => typeof v === 'number');
  if (!vals.length) return '';
  const buckets = [];
  const step = Math.max(1, Math.ceil(vals.length / width));
  for (let i = 0; i < vals.length; i += step) {
    const chunk = vals.slice(i, i + step);
    buckets.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
  }
  const min = Math.min(...buckets), max = Math.max(...buckets);
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  return buckets.map(v => bars[max === min ? 0 : Math.round((v - min) / (max - min) * (bars.length - 1))]).join('');
}

// ---- observe -------------------------------------------------------------------
async function summary(opts = {}) {
  requireLogin();
  try {
    const res = await api.get(`/api/observability/summary${qs({ range: opts.range, project: opts.project })}`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    ui.header(`Traffic summary${opts.range ? ` (${opts.range})` : ''}`);
    ui.divider();
    const t = res.totals && typeof res.totals === 'object' ? res.totals : {};
    for (const [k, v] of Object.entries(t)) {
      const val = v && typeof v === 'object' && 'value' in v ? v.value : v;
      if (typeof val === 'number' || typeof val === 'string') console.log(`  ${k.padEnd(16)} ${c.bold}${/bytes/i.test(k) ? humanBytes(val) : val}${c.reset}`);
    }
    const rows = Array.isArray(res.byProject) ? res.byProject : [];
    if (rows.length) {
      console.log(`\n${c.bold}By project${c.reset}`);
      console.log(`  ${c.dim}${'project'.padEnd(24)}${'requests'.padStart(10)}${'errors'.padStart(9)}${'err %'.padStart(8)}${'p95 ms'.padStart(9)}${'cache %'.padStart(9)}${c.reset}`);
      for (const p of rows) {
        const num = (x) => (x === null || x === undefined ? '-' : (typeof x === 'object' && 'value' in x ? x.value : x));
        console.log(`  ${String(p.name || p.subdomain).slice(0, 23).padEnd(24)}${String(num(p.requests)).padStart(10)}${String(num(p.errors)).padStart(9)}${String(num(p.errorRate)).padStart(8)}${String(num(p.p95)).padStart(9)}${String(num(p.cacheHitRate)).padStart(9)}`);
      }
    }
    if (!Object.keys(t).length && !rows.length) ui.info('No traffic recorded in this range yet.');
    console.log(`\n${c.dim}Full detail: add --json${c.reset}\n`);
  } catch (err) { fail(err, 'Could not load summary'); }
}

async function resources(opts = {}) {
  requireLogin();
  try {
    const res = await api.get('/api/observability/resources');
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const list = res.resources || [];
    if (!list.length) { ui.info('No projects or databases yet.'); return; }
    const c = ui.c;
    ui.header('Resources');
    ui.divider();
    for (const r of list) {
      const state = r.running === true ? `${c.green}running${c.reset}` : r.running === false ? `${c.red}stopped${c.reset}` : `${c.dim}unknown${c.reset}`;
      const mem = r.memUsed != null ? `${humanBytes(r.memUsed)}${r.memLimit ? ' / ' + humanBytes(r.memLimit) : ''}` : '-';
      console.log(`  ${c.bold}${r.name}${c.reset}  ${c.dim}${r.kind}${r.engine ? ' ' + r.engine : ''}${c.reset}  ${state}`);
      console.log(`     ${c.dim}key:${c.reset} ${r.key}   ${c.dim}cpu:${c.reset} ${r.cpu != null ? r.cpu.toFixed ? r.cpu.toFixed(1) + '%' : r.cpu : '-'}   ${c.dim}mem:${c.reset} ${mem}   ${c.dim}uptime:${c.reset} ${r.uptimePct != null ? r.uptimePct + '%' : '-'}`);
    }
    console.log();
  } catch (err) { fail(err, 'Could not load resources'); }
}

async function series(metric, opts = {}) {
  requireLogin();
  if (!ALL_METRICS.includes(metric)) { ui.error(`Unknown metric "${metric}". Metrics: ${ALL_METRICS.join(', ')}`); process.exit(1); }
  if (RESOURCE_METRICS.includes(metric) && !opts.resource) {
    ui.error(`"${metric}" needs --resource <key>. List keys with: joytree observe resources`);
    process.exit(1);
  }
  try {
    const res = await api.get(`/api/observability/series${qs({ metric, range: opts.range, project: opts.project, resource: opts.resource })}`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    const sm = res.summary || {};
    ui.header(`${res.label || metric}${opts.range ? ` (${opts.range})` : ''}`);
    if (res.note) ui.info(res.note);
    const pts = Array.isArray(res.points) ? res.points : [];
    if (pts.length) console.log(`  ${c.green}${sparkline(pts.map(p => p.v))}${c.reset}`);
    console.log(`  ${c.dim}min${c.reset} ${fmtValue(sm.min, res.unit)}   ${c.dim}avg${c.reset} ${fmtValue(sm.avg, res.unit)}   ${c.dim}max${c.reset} ${fmtValue(sm.max, res.unit)}   ${c.dim}last${c.reset} ${c.bold}${fmtValue(sm.last, res.unit)}${c.reset}\n`);
  } catch (err) { fail(err, 'Could not load metric'); }
}

async function requests(opts = {}) {
  requireLogin();
  const filters = { range: opts.range, project: opts.project, status: opts.status, method: opts.method, path: opts.path, cache: opts.cache, country: opts.country, minMs: opts.minMs, limit: opts.limit };
  try {
    const grouped = !!opts.groupBy;
    const url = grouped
      ? `/api/observability/query${qs({ ...filters, groupBy: opts.groupBy, metric: opts.metric })}`
      : `/api/observability/requests${qs({ ...filters, sort: opts.sort })}`;
    const res = await api.get(url);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    if (grouped) {
      ui.header(`Requests grouped by ${opts.groupBy}`);
      const gs = res.groups || [];
      if (!gs.length) { ui.info('No matching requests.'); return; }
      console.log(`  ${c.dim}${'key'.padEnd(32)}${'count'.padStart(8)}${'errors'.padStart(8)}${'err %'.padStart(8)}${'avg ms'.padStart(8)}${'p95 ms'.padStart(8)}${c.reset}`);
      for (const g of gs) console.log(`  ${String(g.label || g.key).slice(0, 31).padEnd(32)}${String(g.count).padStart(8)}${String(g.errors).padStart(8)}${String(g.error_rate).padStart(8)}${String(g.avg_ms).padStart(8)}${String(g.p95_ms).padStart(8)}`);
    } else {
      const rows = res.rows || [];
      ui.header(`Recent requests (${rows.length}${res.total > rows.length ? ' of ' + res.total : ''})`);
      if (!rows.length) { ui.info('No matching requests.'); return; }
      for (const r of rows) {
        const col = r.status >= 500 ? c.red : r.status >= 400 ? c.yellow : c.green;
        console.log(`  ${c.dim}${new Date(r.t).toLocaleTimeString()}${c.reset}  ${col}${r.status}${c.reset}  ${String(r.method || '').padEnd(6)}${String(r.path || '').slice(0, 44).padEnd(45)} ${c.dim}${r.ms}ms ${humanBytes(r.bytes)}${r.cache ? ' ' + r.cache : ''}${r.country ? ' ' + r.country : ''}  ${r.project || ''}${c.reset}`);
      }
    }
    if (res.truncated) ui.warn('Only the most recent requests are kept in memory, so older ones in this range are not shown.');
    console.log();
  } catch (err) { fail(err, 'Could not load requests'); }
}

async function cache(opts = {}) {
  requireLogin();
  try {
    const res = await api.get(`/api/observability/cache${qs({ range: opts.range, project: opts.project })}`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    ui.header(`CDN cache${opts.range ? ` (${opts.range})` : ''}`);
    ui.divider();
    for (const [k, v] of Object.entries(res.cacheStatus || {})) if (typeof v === 'number') console.log(`  ${k.padEnd(14)} ${c.bold}${v}${c.reset}`);
    const miss = res.missingAssets || [];
    if (miss.length) {
      console.log(`\n${c.bold}Assets that miss the cache most${c.reset}`);
      for (const a of miss.slice(0, 10)) console.log(`  ${String(a.misses + a.bypasses).padStart(5)}  ${a.path}  ${c.dim}${a.project || ''}${c.reset}`);
    }
    console.log();
  } catch (err) { fail(err, 'Could not load cache stats'); }
}

async function alerts(opts = {}) {
  requireLogin();
  try {
    const res = await api.get('/api/observability/alerts');
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const c = ui.c;
    ui.header('Alert rules');
    const rules = res.rules || [];
    if (!rules.length) ui.info('No alert rules yet. Add one: joytree observe alert add --name ... --metric error_rate --threshold 5');
    for (const r of rules) {
      const st = r.state && r.state.status;
      const badge = st === 'firing' ? `${c.red}FIRING${c.reset}` : st === 'nodata' ? `${c.dim}no data${c.reset}` : `${c.green}ok${c.reset}`;
      console.log(`  ${r.enabled === false ? c.dim + '\u2717' : c.green + '\u2713'}${c.reset} ${c.bold}${r.name}${c.reset}  ${badge}  ${c.dim}${r.id}${c.reset}`);
      console.log(`     ${r.metric} ${r.metric === 'down' ? '' : `${r.op} ${r.threshold} `}over ${r.windowMinutes}m  ${c.dim}${r.severity}, target ${r.target}${c.reset}`);
    }
    const hist = res.history || [];
    if (hist.length) {
      console.log(`\n${c.bold}Recent history${c.reset}`);
      for (const h of hist.slice(0, 8)) console.log(`  ${c.dim}${h.t ? new Date(h.t).toLocaleString() : ''}${c.reset}  ${h.status || h.state || ''}  ${h.ruleName || h.name || ''} ${c.dim}${h.label || h.message || ''}${c.reset}`);
    }
    console.log();
  } catch (err) { fail(err, 'Could not load alerts'); }
}

// ---- alert rules (create / update / delete) --------------------------------------
function ruleFromFlags(opts, existing = {}) {
  const rule = { ...existing };
  if (opts.name !== undefined) rule.name = String(opts.name);
  if (opts.metric !== undefined) rule.metric = String(opts.metric);
  if (opts.op !== undefined) rule.op = String(opts.op);
  if (opts.threshold !== undefined) {
    const n = Number(opts.threshold);
    if (!Number.isFinite(n)) throw new Error('--threshold must be a number.');
    rule.threshold = n;
  }
  if (opts.window !== undefined) {
    const n = Number(opts.window);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error('--window must be a whole number of minutes between 1 and 60.');
    rule.windowMinutes = n;
  }
  if (opts.severity !== undefined) {
    if (!['warning', 'critical'].includes(opts.severity)) throw new Error('--severity must be warning or critical.');
    rule.severity = opts.severity;
  }
  if (opts.target !== undefined) rule.target = String(opts.target);
  if (opts.webhook !== undefined) {
    if (!/^https:\/\/\S+$/i.test(opts.webhook)) throw new Error('--webhook must be an https:// URL.');
    rule.webhookUrl = opts.webhook;
  }
  if (opts.clearWebhook) rule.webhookUrl = '';
  if (opts.disabled || opts.disable) rule.enabled = false;
  if (opts.enabled || opts.enable) rule.enabled = true;
  if (rule.metric && rule.metric !== 'down' && !ALL_METRICS.includes(rule.metric)) throw new Error(`Unknown metric "${rule.metric}". Metrics: down, ${ALL_METRICS.join(', ')}`);
  if (rule.op !== undefined && !['>', '<'].includes(rule.op)) throw new Error('--op must be > or <.');
  return rule;
}

async function alertAdd(opts = {}) {
  requireLogin();
  let rule;
  try {
    rule = ruleFromFlags(opts);
    if (!rule.name) throw new Error('--name is required.');
    if (!rule.metric) throw new Error('--metric is required.');
    if (rule.metric !== 'down' && rule.threshold === undefined) throw new Error('--threshold is required unless the metric is "down".');
  } catch (e) { ui.error(e.message); process.exit(1); }
  try {
    const res = await api.post('/api/observability/rules', rule);
    ui.success(`Alert rule "${rule.name}" created${res.item && res.item.id ? ` (${res.item.id})` : ''}.`);
  } catch (err) { fail(err, 'Could not create rule'); }
}

async function findRule(idOrName) {
  // This endpoint returns the stored rules including webhookUrl, which the
  // alerts listing leaves out - needed so an update does not wipe the webhook.
  const res = await api.get('/api/observability/rules');
  const items = res.items || [];
  const byId = items.find(r => r.id === idOrName);
  if (byId) return byId;
  const byName = items.filter(r => String(r.name || '').toLowerCase() === String(idOrName).toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`More than one rule is named "${idOrName}". Use an id: ${byName.map(r => r.id).join(', ')}`);
  throw new Error(`No alert rule with id or name "${idOrName}". Run: joytree observe alerts`);
}

async function alertUpdate(idOrName, opts = {}) {
  requireLogin();
  try {
    const existing = await findRule(idOrName);
    const keep = { name: existing.name, metric: existing.metric, op: existing.op, threshold: existing.threshold, windowMinutes: existing.windowMinutes, severity: existing.severity, enabled: existing.enabled, target: existing.target, webhookUrl: existing.webhookUrl || '' };
    const rule = ruleFromFlags(opts, keep);
    await api.put(`/api/observability/rules/${encodeURIComponent(existing.id)}`, rule);
    ui.success(`Alert rule "${rule.name}" updated.`);
  } catch (err) { fail(err, 'Could not update rule'); }
}

async function alertDelete(idOrName, opts = {}) {
  requireLogin();
  try {
    const existing = await findRule(idOrName);
    if (!opts.yes && !(await confirm(`Delete alert rule "${existing.name}"?`, false))) { ui.info('Cancelled.'); return; }
    await api.delete(`/api/observability/rules/${encodeURIComponent(existing.id)}`);
    ui.success(`Alert rule "${existing.name}" deleted.`);
  } catch (err) { fail(err, 'Could not delete rule'); }
}

// ---- metrics / rollback / cdn -----------------------------------------------------
async function metrics(project, opts = {}) {
  requireLogin();
  try {
    const res = await api.get(`/api/projects/${encodeURIComponent(project)}/metrics`);
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    if (res.status === 'no_container') { ui.info(`${project} has no running container right now.`); return; }
    ui.header(`Live metrics \u2014 ${project}`);
    for (const [k, v] of Object.entries(res)) {
      if (['ok', 'projectId', 'subdomain'].includes(k) || v === null || v === undefined) continue;
      ui.label(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    console.log();
  } catch (err) { fail(err, 'Could not load metrics'); }
}

async function rollback(deploymentId, opts = {}) {
  requireLogin();
  if (!opts.yes) {
    ui.warn('This redeploys the exact commit of that earlier build and replaces what is live now.');
    if (!(await confirm(`Roll back to deployment ${ui.c.bold}${deploymentId}${ui.c.reset}?`, false))) { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner('Starting rollback');
  try {
    const res = await api.post(`/api/deployments/${encodeURIComponent(deploymentId)}/rollback`);
    spin.stop();
    ui.success(res.message || 'Rollback started.');
    if (res.deployId) ui.label('New deploy ID', res.deployId);
    ui.info('Watch progress with: joytree deployments');
  } catch (err) { spin.stop(); fail(err, 'Rollback failed'); }
}

async function cdn(project, action) {
  requireLogin();
  const base = `/api/projects/${encodeURIComponent(project)}/cdn`;
  try {
    if (action === 'status') {
      const res = await api.get(`${base}/status`);
      console.log(`CDN for ${ui.c.bold}${project}${ui.c.reset}: ${res.enabled ? ui.c.green + 'on' : ui.c.dim + 'off'}${ui.c.reset}`);
    } else if (action === 'on' || action === 'off') {
      await api.post(`${base}/toggle`, { enabled: action === 'on' });
      ui.success(`CDN is now ${action} for ${project}.`);
    } else if (action === 'purge') {
      const res = await api.post(`${base}/purge`);
      ui.success(`Cache purged${res.purged ? ' for ' + res.purged : ''}.`);
    } else {
      ui.error('Use: joytree cdn <project> status | on | off | purge');
      process.exit(1);
    }
  } catch (err) { fail(err, 'CDN request failed'); }
}

module.exports = {
  summary, resources, series, requests, cache, alerts, alertAdd, alertUpdate, alertDelete, metrics, rollback, cdn,
  humanBytes, fmtValue, sparkline, ruleFromFlags,
};
