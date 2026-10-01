'use strict';

// joytree blueprint plan | deploy | browse
// A Blueprint is a joytree.joy file that describes a whole stack (web, worker,
// static and Dockerfile services plus databases) so it can be deployed in one go.

const { execSync } = require('child_process');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');
const { ask, confirm } = require('../lib/prompt');

function requireLogin() {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }
}

// git@github.com:owner/repo.git | https://github.com/owner/repo(.git) -> https://github.com/owner/repo
function normalizeGitUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  const ssh = u.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  return u.replace(/\.git\/?$/, '').replace(/\/+$/, '');
}

function detectGitSource() {
  try {
    const url = execSync('git config --get remote.origin.url', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    let branch = '';
    try { branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) {}
    return { repoUrl: normalizeGitUrl(url), branch: branch && branch !== 'HEAD' ? branch : '' };
  } catch (_) { return { repoUrl: '', branch: '' }; }
}

// ["api.STRIPE_KEY=sk_x", ...] -> { api: { STRIPE_KEY: 'sk_x' } }
function parseEnvOverrides(list) {
  const out = {};
  for (const item of [].concat(list || [])) {
    const eq = String(item).indexOf('=');
    const left = eq > 0 ? String(item).slice(0, eq) : '';
    const dot = left.indexOf('.');
    const svc = dot > 0 ? left.slice(0, dot).trim() : '';
    const key = dot > 0 ? left.slice(dot + 1).trim() : '';
    if (!svc || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid --env "${item}". Use SERVICE.KEY=VALUE, e.g. --env api.STRIPE_KEY=sk_live_...`);
    }
    (out[svc] = out[svc] || {})[key] = String(item).slice(eq + 1);
  }
  return out;
}

// ["old=new", ...] -> { old: 'new' }
function parseRenames(list, flag) {
  const out = {};
  for (const item of [].concat(list || [])) {
    const eq = String(item).indexOf('=');
    const from = eq > 0 ? String(item).slice(0, eq).trim() : '';
    const to = eq > 0 ? String(item).slice(eq + 1).trim() : '';
    if (!from || !to) throw new Error(`Invalid ${flag} "${item}". Use old=new.`);
    out[from] = to;
  }
  return out;
}

function sourceBody(opts) {
  let repoUrl = opts.repo ? normalizeGitUrl(opts.repo) : '';
  let branch = opts.branch || '';
  if (!repoUrl) {
    const git = detectGitSource();
    if (!git.repoUrl) throw new Error('No repository given. Pass --repo <github-url>, or run this inside a git clone with an origin remote.');
    repoUrl = git.repoUrl;
    if (!branch) branch = git.branch;
    ui.info(`Using ${ui.c.bold}${repoUrl}${ui.c.reset}${branch ? ` (${branch})` : ''} from this folder's git remote`);
  }
  return { repoUrl, branch: branch || undefined, blueprintPath: opts.file || undefined };
}

// Env vars a service still needs a value for. Mirrors the server: values that
// are overridden, have a default in the file, or are CORS-style vars that get
// auto-filled from the Blueprint's own static site are not counted.
const CORS_RE = /^(CORS_ORIGINS?|ALLOWED_ORIGINS?|CLIENT_ORIGIN|CLIENT_URL|FRONTEND_URL|FRONTEND_ORIGIN)$/i;
function missingEnv(spec, overrides) {
  const missing = [];
  const hasStatic = (spec.services || []).some(s => s.type === 'static');
  for (const svc of spec.services || []) {
    for (const key of svc.requiredEnv || []) {
      if (CORS_RE.test(key) && svc.type !== 'static' && hasStatic) continue;
      const given = overrides[svc.name] && overrides[svc.name][key];
      const dflt = svc.env && svc.env[key];
      if (String(given || '').trim() || String(dflt || '').trim()) continue;
      missing.push({ service: svc.name, key });
    }
  }
  return missing;
}

function printPlan(plan) {
  const spec = plan.spec || { services: [], databases: [] };
  const c = ui.c;
  ui.header(`Blueprint${spec.name ? ` ${D}${spec.name}` : ''}${plan.blueprintPath ? ` ${c.dim}(${plan.blueprintPath})${c.reset}` : ''}`);
  ui.divider();

  const services = spec.services || [];
  console.log(`${c.bold}Services${c.reset} ${c.dim}(${services.length})${c.reset}`);
  for (const s of services) {
    const kind = s.declaredType || s.type;
    const how = s.isDockerfileDeploy ? `Dockerfile${s.dockerfilePath ? ' ' + s.dockerfilePath : ''}` : (s.runtime || 'auto-detect');
    const avail = s.nameAvailable === false ? `  ${c.yellow}name already in use${c.reset}` : '';
    console.log(`  ${c.bold}${s.name}${c.reset}  ${c.cyan}${kind}${c.reset}  ${c.dim}${how}${c.reset}${avail}`);
    if (s.type !== 'worker') console.log(`     ${c.dim}https://${s.subdomain || s.name}.joytree.site${c.reset}`);
    if (s.startCmd) console.log(`     ${c.dim}start: ${s.startCmd}${c.reset}`);
    if (s.requiredEnv && s.requiredEnv.length) console.log(`     ${c.yellow}needs values:${c.reset} ${s.requiredEnv.join(', ')}`);
  }

  const dbs = spec.databases || [];
  if (dbs.length) {
    console.log(`\n${c.bold}Databases${c.reset} ${c.dim}(${dbs.length})${c.reset}`);
    for (const d of dbs) {
      const avail = d.nameAvailable === false ? `  ${c.yellow}name already in use${c.reset}` : '';
      console.log(`  ${c.bold}${d.name}${c.reset}  ${c.cyan}${d.engine}${c.reset}  ${c.dim}${d.memory}${d.linkTo && d.linkTo.length ? '  -> ' + d.linkTo.join(', ') : ''}${c.reset}${avail}`);
    }
  }
  for (const w of plan.warnings || []) ui.warn(w);
  for (const e of plan.errors || []) ui.error(e);
  console.log();
}
const D = '\u2014 ';

async function plan(opts = {}) {
  requireLogin();
  let body;
  try { body = sourceBody(opts); } catch (e) { ui.error(e.message); process.exit(1); }
  const spin = ui.spinner('Reading Blueprint');
  try {
    const res = await api.post('/api/blueprints/plan', body);
    spin.stop();
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); }
    else {
      printPlan(res);
      if (res.ok) ui.info(`Deploy it with: ${ui.c.cyan}joytree blueprint deploy${ui.c.reset}`);
    }
    if (!res.ok) process.exit(1);
  } catch (err) {
    spin.stop();
    ui.error(`Could not read the Blueprint: ${err.message}`);
    process.exit(1);
  }
}

async function deploy(opts = {}) {
  requireLogin();
  let body, envOverrides, serviceNameOverrides, databaseNameOverrides;
  try {
    body = sourceBody(opts);
    envOverrides = parseEnvOverrides(opts.env);
    serviceNameOverrides = parseRenames(opts.renameService, '--rename-service');
    databaseNameOverrides = parseRenames(opts.renameDb, '--rename-db');
  } catch (e) { ui.error(e.message); process.exit(1); }

  // 1. Plan first, so nothing is created if the file is invalid.
  let planRes;
  const spin = ui.spinner('Reading Blueprint');
  try { planRes = await api.post('/api/blueprints/plan', body); spin.stop(); }
  catch (err) { spin.stop(); ui.error(`Could not read the Blueprint: ${err.message}`); process.exit(1); }
  printPlan(planRes);
  if (!planRes.ok) { ui.error('Fix the errors above, then try again. Nothing was deployed.'); process.exit(1); }

  // 2. Collect any env values the Blueprint still needs.
  const missing = missingEnv(planRes.spec, envOverrides);
  if (missing.length) {
    if (opts.yes || !process.stdin.isTTY) {
      ui.error(`Missing values: ${missing.map(m => `${m.service}.${m.key}`).join(', ')}`);
      ui.info('Pass them with --env SERVICE.KEY=VALUE (repeat for each).');
      process.exit(1);
    }
    console.log(`${ui.c.bold}This Blueprint needs a few values before it can deploy:${ui.c.reset}`);
    for (const m of missing) {
      const val = await ask(`  ${m.service}.${m.key}`);
      if (!val) { ui.error('A value is required. Nothing was deployed.'); process.exit(1); }
      (envOverrides[m.service] = envOverrides[m.service] || {})[m.key] = val;
    }
    console.log();
  }

  // 3. Confirm, then deploy.
  if (!opts.yes) {
    const n = (planRes.spec.services || []).length + (planRes.spec.databases || []).length;
    const go = await confirm(`${ui.c.bold}Deploy ${n} resource${n === 1 ? '' : 's'} now?${ui.c.reset}`, true);
    if (!go) { ui.info('Cancelled.'); return; }
  }

  const spin2 = ui.spinner('Deploying Blueprint');
  try {
    const res = await api.post('/api/blueprints/deploy', {
      ...body,
      envOverrides: Object.keys(envOverrides).length ? envOverrides : undefined,
      serviceNameOverrides: Object.keys(serviceNameOverrides).length ? serviceNameOverrides : undefined,
      databaseNameOverrides: Object.keys(databaseNameOverrides).length ? databaseNameOverrides : undefined,
    });
    spin2.stop();
    if (opts.json) console.log(JSON.stringify(res, null, 2));
    else printResult(res);
    if (!res.ok) process.exit(1);
  } catch (err) {
    spin2.stop();
    ui.error(`Blueprint deploy failed: ${err.message}`);
    if (err.data && Array.isArray(err.data.errors)) err.data.errors.forEach(e => ui.error(e));
    process.exit(1);
  }
}

function printResult(res) {
  const c = ui.c;
  ui.header('Result');
  ui.divider();
  for (const r of res.resources || []) {
    const mark = r.ok ? `${c.green}\u2713${c.reset}` : `${c.red}\u2717${c.reset}`;
    const what = r.kind === 'database' ? `database ${r.engine || ''}`.trim() : (r.type || 'service');
    console.log(`  ${mark} ${c.bold}${r.name}${c.reset}  ${c.dim}${what}${c.reset}`);
    if (r.url) console.log(`     ${c.cyan}${r.url}${c.reset}`);
    if (r.error) console.log(`     ${c.red}${r.error}${c.reset}`);
    if (r.note) console.log(`     ${c.dim}${r.note}${c.reset}`);
  }
  for (const w of res.warnings || []) ui.warn(w);
  console.log();
  if (res.ok) ui.success('Blueprint deployed. Follow builds with: joytree deployments');
  else ui.error('Some resources failed. See above; fix and run the command again.');
}

async function browse(dir, opts = {}) {
  requireLogin();
  let body;
  try { body = sourceBody({ ...opts, file: undefined }); } catch (e) { ui.error(e.message); process.exit(1); }
  const spin = ui.spinner('Listing files');
  try {
    const res = await api.post('/api/blueprints/browse', { repoUrl: body.repoUrl, branch: body.branch, dir: dir || '' });
    spin.stop();
    if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }
    const entries = res.entries || [];
    if (!entries.length) { ui.info('That directory is empty.'); return; }
    ui.header(`${body.repoUrl.replace('https://github.com/', '')}/${dir || ''}`);
    for (const e of entries) {
      const isBp = e.type === 'file' && /(^|\/)joytree\.joy$/i.test(e.path || e.name);
      console.log(`  ${e.type === 'dir' ? ui.c.cyan + e.name + '/' : (isBp ? ui.c.green + e.name + ui.c.reset + ui.c.dim + '  <- Blueprint' : e.name)}${ui.c.reset}`);
    }
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Could not list files: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { plan, deploy, browse, normalizeGitUrl, parseEnvOverrides, parseRenames, missingEnv };
