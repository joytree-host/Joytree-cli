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

function buildSnippet(engine, externalConn) {
  switch (engine) {
    case 'postgres':
      return [
        ['Node.js (pg)', `const { Client } = require('pg');\nconst client = new Client({ connectionString: '${externalConn}' });\nawait client.connect();`],
        ['Python (psycopg2)', `import psycopg2\nconn = psycopg2.connect('${externalConn}')`],
        ['Prisma (.env)', `DATABASE_URL="${externalConn}"`],
      ];
    case 'mysql':
    case 'mariadb':
      return [
        ['Node.js (mysql2)', `const mysql = require('mysql2/promise');\nconst conn = await mysql.createConnection('${externalConn}');`],
        ['Python (PyMySQL)', `import pymysql\nconn = pymysql.connect(host='HOST', user='USER', password='PASS', database='DB')`],
        ['Prisma (.env)', `DATABASE_URL="${externalConn}"`],
      ];
    case 'mongodb':
      return [
        ['Node.js (mongoose)', `const mongoose = require('mongoose');\nawait mongoose.connect('${externalConn}');`],
        ['Node.js (MongoClient)', `const { MongoClient } = require('mongodb');\nconst client = new MongoClient('${externalConn}');\nawait client.connect();`],
        ['Python (pymongo)', `from pymongo import MongoClient\nclient = MongoClient('${externalConn}')`],
      ];
    case 'redis':
      return [
        ['Node.js (ioredis)', `const Redis = require('ioredis');\nconst redis = new Redis('${externalConn}');`],
        ['Node.js (redis)', `const { createClient } = require('redis');\nconst client = createClient({ url: '${externalConn}' });\nawait client.connect();`],
        ['Python (redis-py)', `import redis\nr = redis.from_url('${externalConn}')`],
      ];
    default:
      return [];
  }
}

async function pollDbReady(dbId, timeoutMs = 60000) {
  const start = Date.now();
  const spin  = ui.spinner('Waiting for database to come online');
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const data  = await api.get('/api/databases');
      const items = Array.isArray(data) ? data : (data.databases || data.dbs || []);
      const found = items.find(d => String(d.id || d._id) === String(dbId));
      if (found && String(found.status || '').toLowerCase() === 'running') {
        spin.stop();
        return found;
      }
      if (found && String(found.status || '').toLowerCase() === 'failed') {
        spin.stop();
        return found;
      }
    } catch (_) {}
  }
  spin.stop();
  return null;
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
    { label: '256 MB  — default (recommended)', val: '256m' },
    { label: '512 MB  — heavier workloads',     val: '512m' },
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
  let createData;
  try {
    createData = await api.post('/api/databases', {
      name,
      engine: engine.key,
      user:   dbUser || undefined,
      pass:   dbPass,
      dbName: dbName || undefined,
      memory: memChoice.val,
    });
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
  spin.stop();

  const dbId = createData.id || createData._id;
  const ready = await pollDbReady(dbId);

  if (!ready) {
    ui.warn('Database is still provisioning. Check status with: joytree db list');
    console.log(`\n  ${ui.c.dim}Save your password — it won't be shown again:${ui.c.reset}`);
    console.log(`  ${ui.c.yellow}${dbPass}${ui.c.reset}\n`);
    return;
  }

  if (String(ready.status || '').toLowerCase() === 'failed') {
    ui.error(`Database provisioning failed: ${ready.error || 'Unknown error'}`);
    process.exit(1);
  }

  // Success — show internal + external connection strings, like the dashboard does
  console.log(`\n${ui.c.green}${ui.c.bold}🎉 🎉 🎉  Database "${name}" is live!  🎉 🎉 🎉${ui.c.reset}\n`);

  const internalConn = ready.connStr || ready.connectionString || '';
  const externalConn = ready.externalConnectionString || internalConn;

  ui.header('Connection Strings');
  ui.divider();
  ui.label('Internal', `${ui.c.cyan}${internalConn || '—'}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Use this from other projects deployed on Joytree (same host).${ui.c.reset}`);
  console.log();
  ui.label('External', `${ui.c.cyan}${externalConn || '—'}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Use this to connect from outside Joytree (your laptop, another server).${ui.c.reset}`);

  console.log(`\n  ${ui.c.dim}Save your password — it won't be shown again:${ui.c.reset}`);
  console.log(`  ${ui.c.yellow}${dbPass}${ui.c.reset}`);

  const snippets = buildSnippet(engine.key, externalConn || internalConn);
  if (snippets.length) {
    ui.header('Quick Connect Snippets');
    ui.divider();
    snippets.forEach(([label, code]) => {
      console.log(`\n  ${ui.c.bold}${ui.c.cyan}${label}${ui.c.reset}`);
      code.split('\n').forEach(line => console.log(`  ${ui.c.dim}${line}${ui.c.reset}`));
    });
  }

  console.log(`\n  ${ui.c.dim}Manage: ${ui.c.cyan}joytree db list${ui.c.reset}${ui.c.dim} · ${ui.c.cyan}joytree db logs ${dbId}${ui.c.reset}\n`);
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
  const apiKey  = require('../lib/config').getApiKey();
  const baseUrl = require('../lib/config').getBaseUrl();
  const https   = require('https');
  const http    = require('http');
  const { URL } = require('url');

  if (!apiKey) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  ui.header(`DB Logs — ${dbId}`);
  ui.divider();
  ui.info(`Streaming logs (Ctrl+C to stop)`);

  const url = new URL(`${baseUrl}/api/databases/${encodeURIComponent(dbId)}/logs`);
  const mod = url.protocol === 'https:' ? https : http;

  const req = mod.request({
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname,
    method:   'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept':        'text/event-stream',
      'User-Agent':    `joytree-cli/${require('../package.json').version}`,
    },
  }, (res) => {
    if (res.statusCode >= 400) {
      ui.error(`Failed (HTTP ${res.statusCode}).`);
      process.exit(1);
    }
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      buf += chunk;
      const events = buf.split('\n\n');
      buf = events.pop();
      for (const block of events) {
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr || dataStr === 'ping') continue;
        try {
          const ev  = JSON.parse(dataStr);
          const msg = ev.message || ev.text || ev.log || (typeof ev === 'string' ? ev : JSON.stringify(ev));
          const lvl = String(ev.level || '').toLowerCase();
          const colored = lvl === 'error' || lvl === 'stderr' ? `${ui.c.red}${msg}${ui.c.reset}`
                        : lvl === 'warn'                      ? `${ui.c.yellow}${msg}${ui.c.reset}` : `${ui.c.dim}${msg}${ui.c.reset}`;
          console.log(`  ${colored}`);
        } catch (_) {
          if (dataStr) console.log(`  ${ui.c.dim}${dataStr}${ui.c.reset}`);
        }
      }
    });
    res.on('end', () => { console.log(); process.exit(0); });
  });

  req.on('error', err => { ui.error(`Connection error: ${err.message}`); process.exit(1); });
  req.end();
  process.on('SIGINT', () => { req.destroy(); console.log(); process.exit(0); });
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
