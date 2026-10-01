#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

const auth      = require('../commands/auth');
const deploy     = require('../commands/deploy');
const projects   = require('../commands/projects');
const envCmd     = require('../commands/env');
const logs       = require('../commands/logs');
const domains    = require('../commands/domains');
const db         = require('../commands/db');
const migrate    = require('../commands/migrate');
const account    = require('../commands/account');
const github     = require('../commands/github');
const webhook    = require('../commands/webhook');
const ssh        = require('../commands/ssh');
const extras     = require('../commands/extras');
const agent      = require('../commands/agent');
const apibuilder = require('../commands/apibuilder');
const registrar  = require('../commands/registrar');
const misc       = require('../commands/misc');
const ui         = require('../lib/ui');

function showHelp() {
  const c = ui.c;
  ui.logo();

  // Iconic layout: green bullet + bold green command + gray description
  // Completely different from pxxl's plain two-column style
  const row = (cmd, desc) => {
    console.log(`  ${c.dgreen}▸${c.reset} ${c.bold}${c.green}${cmd.padEnd(38)}${c.reset} ${c.gray}${desc}${c.reset}`);
  };
  const section = (icon, title) => {
    console.log(`\n${c.bold}${c.dgreen}${icon} ${title}${c.reset}`);
    console.log(`${c.dgreen}${'╌'.repeat(52)}${c.reset}`);
  };

  section('◈', 'Account');
  row('joytree login --api-key <key>',       'Validate and save a Joytree API key');
  row('joytree logout',                      'Remove local credentials');
  row('joytree whoami',                      'Show active account and API key scope');
  row('joytree status',                      'Account status and project overview');
  row('joytree workspace',                   'Workspace plan and storage usage');

  section('◈', 'API Key');
  row('joytree apikey show',                 'View current API key and usage stats');
  row('joytree apikey rotate',               'Revoke old key and generate a new one');

  section('◈', 'Deploy');
  row('joytree deploy -r <repo>',            'Deploy a GitHub repo — interactive wizard');
  row('joytree deploy --static',             'Skip wizard, force static site');
  row('joytree redeploy <project-id>',       'Trigger a fresh redeployment');
  row('joytree stop <deploy-id>',            'Cancel a currently running deployment');
  row('joytree autodeploy <id> --enable',    'Enable GitHub push auto-deploy');
  row('joytree autodeploy <id> --disable',   'Disable GitHub push auto-deploy');
  row('joytree deployments [project-id]',    'Show recent deployments');
  row('joytree open <project-id>',           'Open live URL in your browser');
  row('joytree upload --dir ./myapp',        'Deploy from a local folder (no git)');

  section('◈', 'Projects');
  row('joytree projects',                    'List all your projects');
  row('joytree inspect <project-id>',        'Show full project details');
  row('joytree delete <project-id>',         'Delete a project (irreversible)');

  section('◈', 'Logs');
  row('joytree logs <project-id>',           'Fetch recent runtime logs');
  row('joytree logs <id> --follow',          'Stream live project logs in real time');
  row('joytree logs <id> --lines 100',       'Fetch logs by line count');

  section('◈', 'Environment Variables');
  row('joytree env list <project-id>',       'List project env var keys');
  row('joytree env set <id> KEY=VALUE',      'Set one or more env vars');
  row('joytree env delete <id> <KEY>',       'Delete an env var');
  row('joytree env push <project-id>',       'Push a local .env file to a project');
  row('joytree env push <id> --force',       'Replace all existing env vars');

  section('◈', 'GitHub');
  row('joytree pull repos',                  'List your linked GitHub repositories');
  row('joytree pull branches <repo-url>',    'List branches for a repository');

  section('◈', 'Domains');
  row('joytree domains list',                'List all custom domains');
  row('joytree domains attach <d> <id>',     'Attach a custom domain to a project');
  row('joytree domains transfer <d> <id>',   'Transfer domain — stream DNS progress live');
  row('joytree domains verify <domain>',     'Trigger DNS verification');
  row('joytree domains remove <domain>',     'Remove a custom domain');
  row('joytree domains check <domain>',      'Check domain availability');

  section('◈', 'DNS Management');
  row('joytree domains dns <domain>',        'View all DNS records for a domain');
  row('joytree domains dns-add <domain>',    'Add a DNS record (A/CNAME/MX/TXT)');
  row('joytree domains dns-delete <domain>', 'Delete a DNS record');
  row('joytree domains nameservers <domain>','Update nameservers for a domain');

  section('◈', 'External URL Proxy');
  row('joytree domains proxy-list',          'List all external URL proxies');
  row('joytree domains proxy-set <sub>',     'Point a subdomain to an external URL');
  row('joytree domains proxy-remove <sub>',  'Remove an external URL proxy');

  section('◈', 'Domain Registration');
  row('joytree domains tlds',                'List available TLDs and pricing');
  row('joytree domains register <domain>',   'Register a brand new domain');

  section('◈', 'Databases');
  row('joytree db list',                     'List all databases');
  row('joytree db create',                   'Create a database — interactive wizard');
  row('joytree db start <db-id>',            'Start a stopped database');
  row('joytree db stop <db-id>',             'Stop a running database');
  row('joytree db restart <db-id>',          'Restart a database');
  row('joytree db logs <db-id>',             'Fetch recent database logs');
  row('joytree db delete <db-id>',           'Delete a database (irreversible)');

  section('◈', 'Data Migration');
  row('joytree migrate start',               'Migrate data into a JoyTree database — interactive wizard');
  row('joytree migrate list',                'List all migrations, most recent first');
  row('joytree migrate status <job-id>',     'Check a migration\'s progress, result, and logs');
  row('joytree migrate delete <job-id>',     'Delete one migration from history');
  row('joytree migrate clear',               'Delete ALL migration history (irreversible)');
  row('joytree diff',                         'Compare two databases (any engines) — interactive wizard');

  section('◈', 'AI Agent');
  row('joytree agent providers',             'List AI providers (Llama, GPT, Claude, Grok)');
  row('joytree agent start --prompt "..."',  'Start an AI agent session');
  row('joytree agent status <session-id>',   'Check on a running agent session');
  row('joytree agent followup <id> -m "..."','Send a follow-up to an agent session');

  section('◈', 'API Builder');
  row('joytree api providers',               'List Joytree AI versions (v1–v4)');
  row('joytree api create --prompt "..."',   'Generate a REST API from a text prompt');
  row('joytree api list',                    'List your generated APIs');
  row('joytree api inspect <flow-id>',       'Show details for a generated API');
  row('joytree api followup <id> -m "..."',  'Refine a generated API with more instructions');
  row('joytree api dockerize <flow-id>',     'Package a flow into a persistent container');
  row('joytree api link <id> --project-id',  'Link a generated API to a project');
  row('joytree api delete <flow-id>',        'Delete a generated API (irreversible)');

  section('◈', 'Webhooks');
  row('joytree webhook secret',              'Show your global webhook secret');
  row('joytree webhook rotate',              'Regenerate your webhook secret');

  section('◈', 'SSH Keys');
  row('joytree ssh list',                    'List all SSH keys');
  row('joytree ssh generate --name <n>',     'Generate a new SSH key pair');
  row('joytree ssh delete <key-id>',         'Delete an SSH key');

  section('◈', 'Billing & Support');
  row('joytree billing',                     'Show billing configuration status');
  row('joytree support -m "..."',            'Send a message to Joytree support');

  section('◈', 'Activity');
  row('joytree activity',                    'Show recent platform activity feed');
  row('joytree activity --limit <n>',        'Limit number of events shown');

  console.log(`\n${c.gray}  Run ${c.green}joytree${c.gray} with no arguments any time to see this list again.${c.reset}\n`);
}

program
  .name('joytree')
  .description('Joytree CLI — deploy and manage your projects from the terminal')
  .version(pkg.version)
  .helpOption(false)
  .addHelpCommand(false);

if (process.argv.length === 2) { showHelp(); process.exit(0); }

// ── Auth ──────────────────────────────────────────────────────────────
program.command('login').option('--api-key <key>').action(auth.login);
program.command('logout').action(auth.logout);
program.command('whoami').action(auth.whoami);
program.command('status').action(account.status);
program.command('workspace').action(misc.workspace);

// ── API Key ───────────────────────────────────────────────────────────
const apikeyGroup = program.command('apikey');
apikeyGroup.command('show').action(extras.apiKey);
apikeyGroup.command('rotate').action(extras.rotateApiKey);

// ── Activity ──────────────────────────────────────────────────────────
program.command('activity').option('--limit <n>', '', '20').action(extras.activity);

// ── GitHub ────────────────────────────────────────────────────────────
const pullGroup = program.command('pull');
pullGroup.command('repos').action(github.repos);
pullGroup.command('branches <repo-url>').action(github.branches);

// ── Deploy ────────────────────────────────────────────────────────────
const collectOpt = (val, prev) => prev.concat([val]);
program.command('deploy')
  .option('-r, --repo <url>')
  .option('-b, --branch <branch>')
  .option('-n, --name <name>')
  .option('--build <cmd>', 'Build command')
  .option('--start <cmd>', 'Start command')
  .option('--install <cmd>', 'Install command')
  .option('--output <dir>', 'Output directory (static sites)')
  .option('--node <version>', 'Node.js version, e.g. 20')
  .option('--runtime <name>', 'Force a runtime: node, python, go, php, ruby, java, dotnet, rust, bun, deno ...')
  .option('--workdir <dir>', 'Sub-directory to build and run from (monorepos)')
  .option('--static', 'Deploy as a static site')
  .option('--worker', 'Deploy as a Background Worker: long-running process, no public URL (needs --start)')
  .option('--dockerfile [path]', 'Build from a Dockerfile (default path: Dockerfile)')
  .option('--docker-cmd <cmd>', 'Override the Dockerfile CMD')
  .option('--port <n>', 'Port the app listens on inside the container (default 3000)')
  .option('--pre-deploy <cmd>', 'Command to run after build and before going live, e.g. a migration')
  .option('-e, --env <KEY=VALUE>', 'Environment variable (repeatable)', collectOpt, [])
  .option('-y, --yes', 'Skip all prompts and the confirmation')
  .option('-m, --message <msg>')
  .action(deploy.deployGit);

program.command('redeploy <project-id>').action(deploy.redeploy);
program.command('stop <deploy-id>').action(extras.stopDeploy);
program.command('autodeploy <project-id>').option('--enable').option('--disable').action(extras.autodeploy);
program.command('open [project-id]').action(deploy.open);
program.command('deployments [project-id]').option('--limit <n>', '', '10').action(deploy.listDeployments);
program.command('upload')
  .option('--dir <path>', '', '.')
  .option('-n, --name <name>')
  .action(misc.uploadDeploy);

// ── Projects ──────────────────────────────────────────────────────────
program.command('projects').option('--json').action(projects.list);
program.command('inspect <project-id>').action(projects.inspect);
program.command('delete <project-id>').option('-y, --yes').action(projects.deleteProject);

// ── Logs ──────────────────────────────────────────────────────────────
program.command('logs <project-id>').option('--lines <n>', '', '50').option('-f, --follow').action(logs.fetchLogs);

// ── Env ───────────────────────────────────────────────────────────────
const envGroup = program.command('env');
envGroup.command('list <project-id>').action(envCmd.list);
envGroup.command('set <project-id> <KEY=VALUE...>').action(envCmd.set);
envGroup.command('delete <project-id> <KEY>').action(envCmd.del);
envGroup.command('push <project-id>').option('--file <path>', '', '.env').option('--force').action(envCmd.push);

// ── Domains ───────────────────────────────────────────────────────────
const domainGroup = program.command('domains');
domainGroup.command('list').action(domains.list);
domainGroup.command('attach <domain> <project-id>').action(domains.attach);
domainGroup.command('transfer <domain> <project-id>').action(domains.transfer);
domainGroup.command('verify <domain>').action(domains.verify);
domainGroup.command('remove <domain>').action(domains.remove);
domainGroup.command('check <domain>').action(domains.check);
domainGroup.command('tlds').action(registrar.tlds);
domainGroup.command('register <domain>').option('--project-id <id>').option('--years <n>').action((domain, opts) => registrar.register({ domain, ...opts }));
// DNS management
domainGroup.command('dns <domain>').action(domains.dnsRecords);
domainGroup.command('dns-add <domain>').option('--type <type>').option('--host <host>').option('--value <value>').option('--ttl <ttl>').action(domains.dnsAdd);
domainGroup.command('dns-delete <domain>').option('--record-id <id>').action(domains.dnsDelete);
domainGroup.command('nameservers <domain>').option('--ns <list>', 'Comma-separated nameservers').action(domains.nameservers);
// External URL proxy
domainGroup.command('proxy-list').action(domains.proxyList);
domainGroup.command('proxy-set <subdomain>').option('--url <url>').action(domains.proxySet);
domainGroup.command('proxy-remove <subdomain>').action(domains.proxyRemove);

// ── Databases ─────────────────────────────────────────────────────────
const dbGroup = program.command('db');
dbGroup.command('list').action(db.list);
dbGroup.command('create').option('--type <type>', '', 'postgres').option('--name <name>').action(db.create);
dbGroup.command('start <db-id>').action(db.start);
dbGroup.command('stop <db-id>').action(db.stop);
dbGroup.command('restart <db-id>').action(db.restart);
dbGroup.command('logs <db-id>').action(db.fetchLogs);
dbGroup.command('delete <db-id>').option('-y, --yes').action(db.del);

// ── Data Migration ────────────────────────────────────────────────────
// Moves data between databases regardless of engine, including from
// external sources not hosted on JoyTree (Mongo Atlas, Firebase RTDB, or
// an external MySQL/PostgreSQL/MariaDB/Redis instance). Every option below
// is optional -- omit them all for a fully interactive, prompted flow, or
// pass them for a non-interactive/scriptable one.
const migrateGroup = program.command('migrate');
migrateGroup.command('start')
  .option('--source-kind <kind>', 'joytree | mongo | firebase | sql | redis')
  .option('--source-database-id <id>', 'Source JoyTree database id (when --source-kind joytree)')
  .option('--connection-string <str>', 'External connection string (when --source-kind mongo|sql|redis)')
  .option('--sql-engine <engine>', 'mysql | postgres | mariadb (when --source-kind sql)')
  .option('--firebase-url <url>', 'Firebase Realtime Database URL (when --source-kind firebase)')
  .option('--firebase-secret <secret>', 'Optional Firebase legacy database secret')
  .option('--destination-id <id>', 'Destination JoyTree database id (always one of your own)')
  .option('--wait', 'Block and poll until the migration finishes instead of returning immediately')
  .action(migrate.start);
migrateGroup.command('list').action(migrate.list);
migrateGroup.command('status <job-id>').action(migrate.status);
migrateGroup.command('delete <job-id>').option('-y, --yes').action(migrate.del);
migrateGroup.command('clear').option('-y, --yes').action(migrate.clear);

// ── Compare Databases ────────────────────────────────────────────────────
// Same five source kinds as `migrate`, described identically -- just two
// of them (A and B) instead of one source + one JoyTree destination.
// Omit every flag for a fully interactive, prompted flow.
const diff = require('../commands/diff');
program.command('diff')
  .description('Compare two databases (any engines) and see exactly what differs')
  .option('--a-source-kind <kind>', 'joytree | mongo | firebase | sql | redis (Database A)')
  .option('--a-database-id <id>', 'Database A JoyTree database id (when --a-source-kind joytree)')
  .option('--a-connection-string <str>', 'Database A external connection string')
  .option('--a-sql-engine <engine>', 'mysql | postgres | mariadb (when --a-source-kind sql)')
  .option('--a-firebase-url <url>', 'Database A Firebase Realtime Database URL')
  .option('--a-firebase-secret <secret>', 'Database A optional Firebase legacy database secret')
  .option('--b-source-kind <kind>', 'joytree | mongo | firebase | sql | redis (Database B)')
  .option('--b-database-id <id>', 'Database B JoyTree database id (when --b-source-kind joytree)')
  .option('--b-connection-string <str>', 'Database B external connection string')
  .option('--b-sql-engine <engine>', 'mysql | postgres | mariadb (when --b-source-kind sql)')
  .option('--b-firebase-url <url>', 'Database B Firebase Realtime Database URL')
  .option('--b-firebase-secret <secret>', 'Database B optional Firebase legacy database secret')
  .option('--json', 'Print the raw JSON report instead of a formatted summary')
  .action(diff.run);

// ── AI Agent ──────────────────────────────────────────────────────────
const agentGroup = program.command('agent');
agentGroup.command('providers').action(agent.providers);
agentGroup.command('start').option('-p, --prompt <text>').option('--provider <id>').option('--project-id <id>').action(agent.start);
agentGroup.command('status <session-id>').action(agent.status);
agentGroup.command('followup <session-id>').option('-m, --message <text>').action(agent.followup);

// ── API Builder ──────────────────────────────────────────────────────
const apiGroup = program.command('api');
apiGroup.command('providers').action(apibuilder.providers);
apiGroup.command('create').option('-p, --prompt <text>').option('--file <path>').option('--ai-version <version>', '', 'v1').action(apibuilder.create);
apiGroup.command('list').action(apibuilder.list);
apiGroup.command('inspect <flow-id>').action(apibuilder.inspect);
apiGroup.command('followup <flow-id>').option('-m, --message <text>').action(apibuilder.followup);
apiGroup.command('dockerize <flow-id>').action(apibuilder.dockerize);
apiGroup.command('link <flow-id>').option('--project-id <id>').action(apibuilder.link);
apiGroup.command('delete <flow-id>').option('-y, --yes').action(apibuilder.del);

// ── Webhook ───────────────────────────────────────────────────────────
const webhookGroup = program.command('webhook');
webhookGroup.command('secret').action(webhook.getSecret);
webhookGroup.command('rotate').action(webhook.rotateSecret);

// ── SSH ───────────────────────────────────────────────────────────────
const sshGroup = program.command('ssh');
sshGroup.command('list').action(ssh.list);
sshGroup.command('generate').option('--name <name>').action(ssh.generate);
sshGroup.command('delete <key-id>').option('-y, --yes').action(ssh.del);

// ── Billing & Support ─────────────────────────────────────────────────
program.command('billing').action(misc.billingConfig);
program.command('support').option('-m, --message <text>').action(misc.support);

program.parseAsync(process.argv).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
