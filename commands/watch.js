'use strict';
// joytree watch [dir] -- point Joytree at one folder; every new or updated archive (.zip / .tar.gz /
// .tgz) or .html file that lands in it is uploaded and redeployed automatically.
//   my-site.zip  ->  project "my-site"   (a copy like "my-site (1).zip" updates the same project)

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');
const core     = require('../lib/watch-core');

const MAX_BYTES = 250 * 1024 * 1024;           // same limit the dashboard advertises
const STATE_FILE = path.join(os.homedir(), '.joytree', 'watch-state.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString();
const log = (msg) => console.log(`${ui.c.gray}${stamp()}${ui.c.reset} ${msg}`);

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function saveState(all) {
  try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2)); } catch (_) {}
}

function scan(dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isFile()) continue;
    try { const st = fs.statSync(path.join(dir, e.name)); out.push({ name: e.name, size: st.size, mtimeMs: st.mtimeMs }); } catch (_) {}
  }
  return out;
}

const isUploadProject = (p) => !!p && (p.source === 'upload' || String(p.repoUrl || '').startsWith('upload://'));

async function withLockRetry(fn, retryMs) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (err) {
      if (err.status === 409 && i < 5) { log(`${ui.c.yellow}A deploy is already running for this project - retrying shortly...${ui.c.reset}`); await sleep(retryMs); continue; }
      throw err;
    }
  }
}

// Upload one file and (re)deploy. Returns { status: 'deployed'|'skipped', ... }
async function handleFile(dir, file, opts, retryMs) {
  const forced = opts.project ? core.slugFromFilename(opts.project) : '';
  const slug = forced || core.slugFromFilename(file.name);
  if (!slug || (!forced && slug === 'index')) {
    return { status: 'skipped', reason: `cannot derive a project name from "${file.name}" - rename it (e.g. my-site.zip) or use --project <name>` };
  }
  if (file.size > MAX_BYTES) return { status: 'skipped', reason: `${file.name} is larger than 250 MB` };

  let proj = null;
  try { const r = await api.get(`/api/v1/projects/${encodeURIComponent(slug)}`); proj = r.project || r; }
  catch (err) { if (err.status !== 404) throw err; }

  if (proj && !isUploadProject(proj)) {
    return { status: 'skipped', reason: `"${slug}" is a GitHub project - not overwriting it with a file. Use a different file name.` };
  }
  if (!proj && !opts.create) {
    return { status: 'skipped', reason: `no project named "${slug}" yet. Re-run with --create to create it, or rename the file to match an existing project.` };
  }

  const buf = fs.readFileSync(path.join(dir, file.name));
  const mb = `${ui.c.gray}(${(buf.length / 1024 / 1024).toFixed(2)} MB)${ui.c.reset}`;

  if (proj) {
    // Existing upload project: one call. The server extracts an archive into a staging folder and swaps it
    // in only if it is valid (a corrupt zip never touches live files), skips byte-identical files, and
    // queues the redeploy if another deploy is running.
    const sub = proj.subdomain || slug;
    log(`${ui.c.cyan}↑${ui.c.reset} ${ui.c.bold}${file.name}${ui.c.reset} ${mb} → ${ui.c.bold}${sub}${ui.c.reset}`);
    const res = await api.postMultipart(`/api/projects/${encodeURIComponent(sub)}/sync-upload`, {}, buf, file.name) || {};
    if (res.unchanged || res.duplicate) return { status: 'unchanged', slug: sub };
    return { status: 'deployed', slug: sub, deployId: res.deployId, queued: !!res.redeployQueued,
             liveUrl: res.liveUrl || `https://${sub}.joytree.site`, created: false };
  }

  // New project (only with --create): upload, then create the deployment.
  const projectId = 'upload_' + Date.now();
  const fields = { projectId, projectName: slug };
  if (core.isHtml(file.name)) fields.singleHtml = '1';
  log(`${ui.c.cyan}↑${ui.c.reset} ${ui.c.bold}${file.name}${ui.c.reset} ${mb} → ${ui.c.bold}${slug}${ui.c.reset} (new project)`);
  await api.postMultipart('/api/upload-project', fields, buf, file.name);
  const res = await withLockRetry(() => api.post('/api/upload-deploy', { projectId, name: slug, subdomain: slug }), retryMs);
  return { status: 'deployed', slug, deployId: res && res.deployId, liveUrl: (res && res.liveUrl) || `https://${slug}.joytree.site`, created: true };
}

// Follow the build in the background and report the result; never blocks the next file.
async function followBuild(slug, deployId, liveUrl, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(4000);
    try {
      const ws = await api.get('/api/workspace');
      const d = (Array.isArray(ws.deployments) ? ws.deployments : []).find(x => x.id === deployId || x._id === deployId);
      const status = d ? String(d.status || '').toLowerCase() : '';
      if (status === 'success') { log(`${ui.c.green}✓ ${slug} is live${ui.c.reset} ${ui.c.gray}${liveUrl}${ui.c.reset}`); return; }
      if (status === 'failed' || status === 'error') { log(`${ui.c.red}✗ ${slug} build failed${ui.c.reset}: ${d.error || 'see logs'}  ${ui.c.gray}joytree logs ${slug}${ui.c.reset}`); return; }
    } catch (_) {}
  }
}

async function watch(dirArg, opts = {}) {
  if (!config.getApiKey()) { ui.error('Not authenticated. Run: joytree login'); process.exit(1); }
  const dir = path.resolve((dirArg || path.join(os.homedir(), 'Joytree-Deploys')).replace(/^~(?=$|[\\/])/, os.homedir()));
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); ui.info(`Created ${dir}`); }
  if (!fs.statSync(dir).isDirectory()) { ui.error(`Not a folder: ${dir}`); process.exit(1); }

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  const intervalMs = Math.max(200, num(opts.interval, 3) * 1000);
  const stableMs   = num(opts.stable, 3) * 1000;
  const retryMs    = num(process.env.JOYTREE_WATCH_RETRY_MS, 10000);
  const once = !!opts.once;

  const tracker = new core.Tracker({ stableMs });
  const all = loadState();
  const known = all[dir];
  if (known) tracker.loadDone(known);
  else if (!opts.deployExisting && !once) tracker.baseline(scan(dir));     // first run: don't redeploy what's already there

  if (!once) {
    ui.header('Watching for deploys');
    ui.divider();
    ui.label('Folder', dir);
    ui.label('Naming', 'my-site.zip → project "my-site"  (.zip, .tar.gz, .tgz, .html)');
    ui.label('New projects', opts.create ? 'created automatically' : 'not created (add --create to allow)');
    console.log(`  ${ui.c.gray}Save or download an updated file into this folder and it deploys. Ctrl+C to stop.${ui.c.reset}\n`);
  }

  let stopping = false, failures = 0;
  process.on('SIGINT', () => { stopping = true; console.log(); ui.info('Stopped watching.'); process.exit(0); });

  const persist = () => { const s = loadState(); s[dir] = tracker.doneObject(); saveState(s); };

  while (!stopping) {
    const { ready, pending } = tracker.update(scan(dir), Date.now());
    for (const file of ready) {
      let result;
      try { result = await handleFile(dir, file, opts, retryMs); }
      catch (err) {
        if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) continue;       // still locked by the browser - try again next round
        failures++; tracker.markDone(file.name, file.fp); persist();
        log(`${ui.c.red}✗ ${file.name}: ${err.message}${ui.c.reset}`);
        continue;
      }
      tracker.markDone(file.name, file.fp); persist();
      if (result.status === 'skipped') { log(`${ui.c.yellow}⚠ ${file.name}: ${result.reason}${ui.c.reset}`); continue; }
      if (result.status === 'unchanged') { log(`${ui.c.gray}= ${file.name}: identical to what is already deployed - nothing to do${ui.c.reset}`); continue; }
      if (result.queued) { log(`${ui.c.green}✓ Files saved${ui.c.reset} for ${ui.c.bold}${result.slug}${ui.c.reset} - a deploy is already running, so a redeploy is queued to start when it finishes`); continue; }
      log(`${ui.c.green}✓ Deploy started${ui.c.reset} for ${ui.c.bold}${result.slug}${ui.c.reset}${result.created ? ' (created)' : ''}  ${ui.c.gray}${result.liveUrl}${ui.c.reset}`);
      if (opts.wait !== false && !once && result.deployId) followBuild(result.slug, result.deployId, result.liveUrl);
    }
    if (once && pending === 0 && ready.length === 0) break;
    if (once && ready.length && pending === 0) continue;
    await sleep(once ? Math.min(intervalMs, 250) : intervalMs);
  }
  if (once && failures) process.exit(1);
}

module.exports = { watch, handleFile };
