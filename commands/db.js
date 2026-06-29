'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function list() {
  const spin = ui.spinner('Fetching databases');
  try {
    const data = await api.get('/api/v1/databases');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.databases || []);
    if (!items.length) { ui.info('No databases yet. Create one: joytree db create'); return; }
    ui.header(`Databases (${items.length})`);
    ui.divider();
    items.forEach(d => {
      console.log(`  ${ui.statusBadge(d.status)}  ${ui.c.bold}${d.name}${ui.c.reset}  ${ui.c.dim}[${d.type||'db'}]  ${d.id}${ui.c.reset}`);
      if (d.host) console.log(`     ${ui.c.dim}host: ${d.host}:${d.port||'—'}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function create(opts) {
  let { type, name } = opts;
  if (!name) {
    name = await prompt(`${ui.c.bold}Database name:${ui.c.reset} `);
    if (!name) { ui.error('Name is required.'); process.exit(1); }
  }
  const spin = ui.spinner(`Creating ${type||'postgres'} database "${name}"`);
  try {
    const data = await api.post('/api/databases', { type: type || 'postgres', name });
    spin.stop(`Database ${ui.c.bold}${name}${ui.c.reset} created!`);
    if (data.id)               ui.label('ID',   data.id);
    if (data.host)             ui.label('Host', `${data.host}:${data.port||'—'}`);
    if (data.connectionString) ui.label('DSN',  data.connectionString);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function dbAction(dbId, action) {
  const spin = ui.spinner(`${action} database ${dbId}`);
  try {
    await api.post(`/api/databases/${encodeURIComponent(dbId)}/${action}`, {});
    spin.stop(`Database ${ui.c.bold}${dbId}${ui.c.reset} ${action}ped.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

const start   = dbId => dbAction(dbId, 'start');
const stop    = dbId => dbAction(dbId, 'stop');
const restart = dbId => dbAction(dbId, 'restart');

async function fetchLogs(dbId) {
  const spin = ui.spinner(`Fetching logs for ${dbId}`);
  try {
    const data = await api.get(`/api/databases/${encodeURIComponent(dbId)}/logs`);
    spin.stop();
    const lines = Array.isArray(data) ? data : (data.logs || data.lines || []);
    ui.header(`DB Logs — ${dbId}`);
    ui.divider();
    lines.forEach(l => {
      const msg = typeof l === 'string' ? l : (l.message || l.text || JSON.stringify(l));
      console.log(`  ${ui.c.dim}${msg}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function del(dbId, opts) {
  if (!opts.yes) {
    const ans = await prompt(`${ui.c.yellow}Delete database "${dbId}"? Type yes to confirm: ${ui.c.reset}`);
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner(`Deleting ${dbId}`);
  try {
    await api.post(`/api/databases/${encodeURIComponent(dbId)}/delete`, {});
    spin.stop(`Database ${ui.c.bold}${dbId}${ui.c.reset} deleted.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, create, start, stop, restart, fetchLogs, del };
