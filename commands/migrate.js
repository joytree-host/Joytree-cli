'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

const SOURCE_KINDS = [
  { key: 'joytree',  label: 'JoyTree Database', sub: 'One of your own provisioned databases' },
  { key: 'mongo',    label: 'MongoDB Atlas',     sub: 'A real, external Mongo cluster — not Docker-provisioned' },
  { key: 'firebase', label: 'Firebase Realtime DB', sub: 'Pull the whole tree straight from your Firebase project' },
  { key: 'sql',      label: 'External SQL',      sub: 'MySQL, PostgreSQL, or MariaDB — not Docker-provisioned' },
  { key: 'redis',    label: 'External Redis',    sub: 'A real, external Redis instance — not Docker-provisioned' },
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

async function choose(question, options) {
  const c = ui.c;
  console.log(`\n${c.bold}${question}${c.reset}`);
  options.forEach((o, i) => console.log(`  ${c.cyan}${i + 1}${c.reset}  ${c.bold}${o.label}${c.reset}${o.sub ? ` ${c.dim}— ${o.sub}${c.reset}` : ''}`));
  const r = rl();
  return new Promise(resolve => {
    r.question(`\n${c.bold}Choice${c.reset} ${c.dim}[1-${options.length}]${c.reset}: `, ans => {
      r.close();
      const idx = parseInt(ans.trim(), 10) - 1;
      resolve(options[idx] || options[0]);
    });
  });
}

async function fetchJoytreeDatabases() {
  const data = await api.get('/api/databases');
  return Array.isArray(data) ? data : (data.databases || data.dbs || []);
}

async function chooseJoytreeDatabase(question) {
  const dbs = await fetchJoytreeDatabases();
  if (!dbs.length) {
    ui.error('You don\'t have any JoyTree databases yet. Create one first: joytree db create');
    process.exit(1);
  }
  const options = dbs.map(d => ({ label: `${d.name} (${d.engine})`, sub: `id: ${d.id || d._id}`, id: String(d.id || d._id) }));
  const picked = await choose(question, options);
  return picked.id;
}

// [FIX] Mirrors the backend validation added to readFromMongo() — Atlas's
// default "Copy connection string" button omits the database name, which
// would otherwise silently migrate from Mongo's own default "test" database
// instead of erroring. Catching it here in the CLI too means a scripted/
// non-interactive call gets a clear, immediate error instead of relying
// solely on the server round-trip to notice.
function mongoConnStrHasDbName(connectionString) {
  const afterScheme = String(connectionString || '').replace(/^mongodb(\+srv)?:\/\//, '');
  const afterAuth = afterScheme.includes('@') ? afterScheme.slice(afterScheme.lastIndexOf('@') + 1) : afterScheme;
  if (!afterAuth.includes('/')) return false;
  return Boolean(afterAuth.slice(afterAuth.indexOf('/') + 1).split('?')[0].trim());
}

async function buildSourceInteractive() {
  const chosen = await choose('Select a migration source:', SOURCE_KINDS);
  if (chosen.key === 'joytree') {
    const databaseId = await chooseJoytreeDatabase('Select the source database:');
    return { kind: 'joytree', databaseId };
  }
  if (chosen.key === 'mongo') {
    let connectionString = await ask(`${ui.c.bold}MongoDB connection string${ui.c.reset}`);
    while (!mongoConnStrHasDbName(connectionString)) {
      ui.warn('That connection string doesn\'t include a database name (the part after the last "/" before any "?"). Atlas\'s default "Copy connection string" button leaves it out — add it, e.g. mongodb+srv://user:pass@cluster.mongodb.net/YOUR_DB_NAME');
      connectionString = await ask(`${ui.c.bold}MongoDB connection string${ui.c.reset}`);
    }
    return { kind: 'mongo', connectionString };
  }
  if (chosen.key === 'firebase') {
    const databaseUrl = await ask(`${ui.c.bold}Firebase Realtime Database URL${ui.c.reset}`, 'https://your-project-default-rtdb.firebaseio.com');
    const authSecret = await ask(`${ui.c.bold}Database secret${ui.c.reset} ${ui.c.dim}(optional — blank if rules are public)${ui.c.reset}`, '');
    return { kind: 'firebase', databaseUrl, authSecret: authSecret || null };
  }
  if (chosen.key === 'sql') {
    const engineChoice = await choose('Which SQL engine?', [
      { key: 'mysql',    label: 'MySQL' },
      { key: 'postgres', label: 'PostgreSQL' },
      { key: 'mariadb',  label: 'MariaDB' },
    ]);
    const connectionString = await ask(`${ui.c.bold}${engineChoice.label} connection string${ui.c.reset}`);
    return { kind: 'sql', engine: engineChoice.key, connectionString };
  }
  if (chosen.key === 'redis') {
    const connectionString = await ask(`${ui.c.bold}Redis connection string${ui.c.reset}`, 'redis://:password@host:6379');
    return { kind: 'redis', connectionString };
  }
}

function buildSourceFromFlags(opts) {
  const kind = opts.sourceKind;
  if (kind === 'joytree') {
    if (!opts.sourceDatabaseId) throw new Error('--source-database-id is required with --source-kind joytree');
    return { kind: 'joytree', databaseId: opts.sourceDatabaseId };
  }
  if (kind === 'mongo') {
    if (!opts.connectionString) throw new Error('--connection-string is required with --source-kind mongo');
    if (!mongoConnStrHasDbName(opts.connectionString)) {
      throw new Error('Connection string is missing a database name (the part after the last "/" before any "?") -- Atlas\'s default "Copy connection string" button omits it. Add it explicitly, e.g. mongodb+srv://user:pass@cluster.mongodb.net/YOUR_DB_NAME');
    }
    return { kind: 'mongo', connectionString: opts.connectionString };
  }
  if (kind === 'firebase') {
    if (!opts.firebaseUrl) throw new Error('--firebase-url is required with --source-kind firebase');
    return { kind: 'firebase', databaseUrl: opts.firebaseUrl, authSecret: opts.firebaseSecret || null };
  }
  if (kind === 'sql') {
    if (!opts.connectionString) throw new Error('--connection-string is required with --source-kind sql');
    if (!opts.sqlEngine) throw new Error('--sql-engine <mysql|postgres|mariadb> is required with --source-kind sql');
    return { kind: 'sql', engine: opts.sqlEngine, connectionString: opts.connectionString };
  }
  if (kind === 'redis') {
    if (!opts.connectionString) throw new Error('--connection-string is required with --source-kind redis');
    return { kind: 'redis', connectionString: opts.connectionString };
  }
  throw new Error(`Unknown --source-kind: ${kind} (expected joytree | mongo | firebase | sql | redis)`);
}

async function start(opts) {
  let source;
  try {
    // Non-interactive path: every migrate command supports plain flags too,
    // so this can run unattended in a script/CI job, not just a TTY.
    source = opts.sourceKind ? buildSourceFromFlags(opts) : await buildSourceInteractive();
  } catch (err) {
    ui.error(err.message);
    process.exit(1);
  }

  const destinationDatabaseId = opts.destinationId || await chooseJoytreeDatabase('Select the destination database (always one of your own JoyTree databases):');

  const spin = ui.spinner('Starting migration');
  let data;
  try {
    data = await api.post('/api/migrations', { source, destination: { databaseId: destinationDatabaseId } });
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
  spin.stop(`Migration started: ${ui.c.bold}${data.jobId}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Check progress: ${ui.c.cyan}joytree migrate status ${data.jobId}${ui.c.reset}\n`);

  if (opts.wait) await waitForCompletion(data.jobId);
}

async function waitForCompletion(jobId, timeoutMs = 10 * 60 * 1000) {
  const spin = ui.spinner('Migrating (this can take a while for large datasets)');
  const beganAt = Date.now();
  while (Date.now() - beganAt < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    let job;
    try { job = (await api.get(`/api/migrations/${encodeURIComponent(jobId)}`)).job; } catch { continue; }
    if (!job) continue;
    if (job.status === 'success') {
      spin.stop(`Migration ${ui.c.bold}${jobId}${ui.c.reset} finished — ${job.result?.collections ?? 0} collection(s), ${job.result?.rows ?? 0} row(s)/document(s).`);
      return;
    }
    if (job.status === 'failed') {
      spin.stop();
      ui.error(`Migration failed: ${job.error || 'Unknown error'}`);
      process.exit(1);
    }
  }
  spin.stop();
  ui.warn(`Still running after ${Math.round(timeoutMs / 60000)} minutes. Check later: joytree migrate status ${jobId}`);
}

async function list() {
  const spin = ui.spinner('Fetching migrations');
  let jobs;
  try {
    jobs = (await api.get('/api/migrations')).jobs || [];
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
  spin.stop();
  if (!jobs.length) { ui.info('No migrations yet. Start one: joytree migrate start'); return; }
  ui.header(`Migrations (${jobs.length})`);
  ui.divider();
  jobs.forEach(j => {
    console.log(`  ${ui.statusBadge(j.status)}  ${ui.c.bold}${j.sourceLabel}${ui.c.reset} ${ui.c.dim}→${ui.c.reset} ${ui.c.bold}${j.destinationLabel}${ui.c.reset}  ${ui.c.dim}id: ${j.id}${ui.c.reset}`);
    console.log(`     ${ui.c.dim}Started ${new Date(j.startedAt).toLocaleString()}${j.result ? ` · ${j.result.collections} collection(s), ${j.result.rows} row(s)/document(s)` : j.error ? ` · ${j.error}` : ''}${ui.c.reset}`);
  });
  console.log();
}

async function status(jobId) {
  const spin = ui.spinner(`Fetching migration ${jobId}`);
  let job;
  try {
    job = (await api.get(`/api/migrations/${encodeURIComponent(jobId)}`)).job;
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
  spin.stop();
  ui.header(`Migration ${jobId}`);
  ui.divider();
  ui.label('Status', ui.statusBadge(job.status));
  ui.label('Source', job.sourceLabel);
  ui.label('Destination', job.destinationLabel);
  ui.label('Started', new Date(job.startedAt).toLocaleString());
  if (job.completedAt) ui.label('Completed', new Date(job.completedAt).toLocaleString());
  if (job.result) ui.label('Result', `${job.result.collections} collection(s), ${job.result.rows} row(s)/document(s)`);
  if (job.error) ui.label('Error', `${ui.c.red}${job.error}${ui.c.reset}`);
  if (job.logs && job.logs.length) {
    ui.header('Logs');
    ui.divider();
    job.logs.forEach(l => console.log(`  ${ui.c.dim}${typeof l === 'string' ? l : l.line}${ui.c.reset}`));
  }
  console.log();
}

async function del(jobId, opts) {
  if (!opts.yes) {
    const ans = await ask(`${ui.c.yellow}Delete migration "${jobId}" from history? Type yes to confirm${ui.c.reset}`, '');
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner(`Deleting ${jobId}`);
  try {
    await api.delete(`/api/migrations/${encodeURIComponent(jobId)}`);
    spin.stop(`Migration ${ui.c.bold}${jobId}${ui.c.reset} deleted.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function clear(opts) {
  if (!opts.yes) {
    const ans = await ask(`${ui.c.yellow}Clear ALL migration history? Running migrations are left untouched. Type yes to confirm${ui.c.reset}`, '');
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner('Clearing migration history');
  try {
    await api.delete('/api/migrations');
    spin.stop('Migration history cleared.');
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { start, list, status, del, clear };
