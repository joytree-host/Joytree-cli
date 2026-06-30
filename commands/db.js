'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

const ENGINES = [
  { key: 'postgres', label: 'PostgreSQL', defaultUser: 'postgres', defaultDb: 'postgres' },
  { key: 'mysql',    label: 'MySQL',      defaultUser: 'root',     defaultDb: 'mysql'    },
  { key: 'mariadb',  label: 'MariaDB',    defaultUser: 'root',     defaultDb: 'mariadb'  },
  { key: 'mongodb',  label: 'MongoDB',    defaultUser: 'admin',    defaultDb: 'admin'    },
  { key: 'redis',    label: 'Redis',      defaultUser: '',         defaultDb: ''         },
];

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(question, defaultVal = '') {
  const r = rl();
  const suffix = defaultVal ? ` ${ui.c.dim}[${defaultVal}]${ui.c.reset}` : '';
  return new Promise(resolve => r.question(`${question}${suffix}: `, ans => {
    r.close();
    resolve(ans.trim() || defaultVal);
  }));
}

async function askHidden(question, defaultVal = '') {
  // Simple hidden-ish password prompt (best effort in plain readline)
  return ask(question, defaultVal);
}

async function choose(question, options) {
  const c = ui.c;
  console.log(`\n${c.bold}${question}${c.reset}`);
  options.forEach((o, i) => console.log(`  ${c.cyan}${i + 1}${c.reset}  ${o.label}`));
  const r = rl();
  return new Promise(resolve => {
    r.question(`\n${c.bold}Choice${c.reset} ${c.dim}[1-${options.length}]${c.reset}: `, ans => {
      r.close();
      const idx = parseInt(ans.trim(), 10) - 1;
      resolve(options[idx] || options[0]);
    });
  });
}

function randomPassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function list() {
  const spin = ui.spinner('Fetching databases');
  try {
    const data  = await api.get('/api/databases');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.databases || data.dbs || []);
    if (!items.length) { ui.info('No databases yet. Create one: joytree db create'); return; }
    ui.header(`Databases (${items.length})`);
    ui.divider();
    items.forEach(d => {
      console.log(`  ${ui.statusBadge(d.status)}  ${ui.c.bold}${d.name}${ui.c.reset}  ${ui.c.dim}[${d.engine || d.type || 'db'}]  id: ${d.id || d._id}${ui.c.reset}`);
      if (d.connStr || d.connectionString) console.log(`     ${ui.c.dim}${d.connStr || d.connectionString}${ui.c.reset}`);
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

  // Engine selection
  let engine = ENGINES.find(e => e.key === type);
  if (!engine) {
    engine = await choose('Select a database engine:', ENGINES);
  }

  // Name
  if (!name) {
    name = await ask(`${ui.c.bold}Database name${ui.c.reset}`, `joytree-${engine.key}`);
  }

  // Credentials — skip for redis (uses password only, no user/db)
  let dbUser = '', dbPass = '', dbName = '';
  if (engine.key !== 'redis') {
    dbUser = await ask(`${ui.c.bold}Database user${ui.c.reset}`, engine.defaultUser);
    dbPass = await askHidden(`${ui.c.bold}Database password${ui.c.reset} ${ui.c.dim}(blank = auto-generate)${ui.c.reset}`, '');
    if (!dbPass) dbPass = randomPassword();
    dbName = await ask(`${ui.c.bold}Initial database name${ui.c.reset}`, engine.defaultDb);
  } else {
    dbPass = await askHidden(`${ui.c.bold}Redis password${ui.c.reset} ${ui.c.dim}(blank = auto-generate)${ui.c.reset}`, '');
    if (!dbPass) dbPass = randomPassword();
  }

  // Memory
  const memChoice = await choose('Memory allocation:', [
    { label: '128 MB  — light workloads', val: '128m' },
    { label: '256 MB  — default',         val: '256m' },
    { label: '512 MB  — heavier usage',   val: '512m' },
    { label: '1 GB    — production',      val: '1g'   },
  ]);

  console.log(`\n${ui.c.bold}Database Summary${ui.c.reset}`);
  ui.divider();
  ui.label('Name',   name);
  ui.label('Engine', engine.label);
  if (dbUser) ui.label('User', dbUser);
  if (dbName) ui.label('DB',   dbName);
  ui.label('Password', `${ui.c.dim}${'•'.repeat(Math.min(dbPass.length, 16))}${ui.c.reset}`);
  ui.label('Memory', memChoice.val);
  console.log();

  const spin = ui.spinner(`Creating ${engine.label} database "${name}"`);
  try {
    const data = await api.post('/api/databases', {
      name,
      engine: engine.key,
      user:   dbUser || undefined,
      pass:   dbPass,
      dbName: dbName || undefined,
      memory: memChoice.val,
    });
    spin.stop(`Database ${ui.c.bold}${name}${ui.c.reset} is being provisioned!`);
    if (data.id) ui.label('ID', data.id);
    ui.label('Status', data.status || 'provisioning');
    console.log(`\n  ${ui.c.dim}Save your password — it won't be shown again:${ui.c.reset}`);
    console.log(`  ${ui.c.yellow}${dbPass}${ui.c.reset}`);
    console.log(`\n  ${ui.c.dim}Check status: ${ui.c.cyan}joytree db list${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function dbAction(dbId, action) {
  const spin = ui.spinner(`${action.charAt(0).toUpperCase() + action.slice(1)}ing database ${dbId}`);
  try {
    await api.post(`/api/databases/${encodeURIComponent(dbId)}/${action}`, {});
    spin.stop(`Database ${ui.c.bold}${dbId}${ui.c.reset} ${action}ed.`);
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
    const data  = await api.get(`/api/databases/${encodeURIComponent(dbId)}/logs`);
    spin.stop();
    const lines = Array.isArray(data) ? data : (data.logs || data.lines || []);
    if (!lines.length) { ui.info('No log entries found.'); return; }
    ui.header(`DB Logs — ${dbId}`);
    ui.divider();
    lines.forEach(l => {
      const msg = typeof l === 'string' ? l : (l.message || l.text || l.log || JSON.stringify(l));
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
    const ans = await ask(`${ui.c.yellow}Delete database "${dbId}"? Type yes to confirm${ui.c.reset}`, '');
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
