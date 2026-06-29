'use strict';

const fs      = require('fs');
const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function list(projectId) {
  const spin = ui.spinner(`Fetching env vars for ${projectId}`);
  try {
    const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/env`);
    spin.stop();
    const env = data.env || data.envVars || data || {};
    const keys = Object.keys(env);
    if (!keys.length) { ui.info('No env vars set.'); return; }
    ui.header(`Env vars — ${projectId}`);
    ui.divider();
    keys.forEach(k => {
      const v = String(env[k]);
      const masked = v.length > 4 ? v.slice(0,2) + '*'.repeat(Math.min(v.length-2,10)) : '****';
      console.log(`  ${ui.c.bold}${k}${ui.c.reset}=${ui.c.dim}${masked}${ui.c.reset}`);
    });
    console.log(`\n  ${ui.c.dim}${keys.length} variable(s)${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function set(projectId, pairs) {
  const env = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 1) { ui.error(`Invalid format: "${pair}". Use KEY=VALUE`); process.exit(1); }
    env[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  const spin = ui.spinner(`Setting ${Object.keys(env).length} env var(s)`);
  try {
    await api.put(`/api/v1/projects/${encodeURIComponent(projectId)}/env`, env);
    spin.stop(`Env var(s) updated on ${ui.c.bold}${projectId}${ui.c.reset}`);
    Object.keys(env).forEach(k => ui.label(k, '(set)'));
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function del(projectId, key) {
  const spin = ui.spinner(`Deleting ${key}`);
  try {
    const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/env`);
    const env = data.env || data || {};
    delete env[key];
    await api.put(`/api/v1/projects/${encodeURIComponent(projectId)}/env`, env);
    spin.stop(`Deleted env var ${ui.c.bold}${key}${ui.c.reset} from ${projectId}`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function push(projectId, opts) {
  const filePath = opts.file || '.env';
  if (!fs.existsSync(filePath)) { ui.error(`File not found: ${filePath}`); process.exit(1); }
  const raw = fs.readFileSync(filePath, 'utf8');
  const env = {};
  let count = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    count++;
  }
  if (!count) { ui.warn(`No variables found in ${filePath}`); return; }
  const spin = ui.spinner(`Pushing ${count} env var(s) from ${filePath}`);
  try {
    await api.put(`/api/v1/projects/${encodeURIComponent(projectId)}/env`, env);
    spin.stop(`Pushed ${count} env var(s) to ${ui.c.bold}${projectId}${ui.c.reset}`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, set, del, push };
