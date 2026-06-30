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
const account    = require('../commands/account');
const github     = require('../commands/github');
const webhook    = require('../commands/webhook');
const ssh        = require('../commands/ssh');
const extras     = require('../commands/extras');
const agent      = require('../commands/agent');
const registrar  = require('../commands/registrar');
const misc       = require('../commands/misc');
const ui         = require('../lib/ui');

function showHelp() {
  const c = ui.c;
  ui.logo();

  const row = (left, right) => {
    const padded = left.padEnd(40);
    console.log(`  ${c.cyan}${padded}${c.reset}${c.dim}${right}${c.reset}`);
  };
  const section = (title) => console.log(`\n${c.bold}${title}${c.reset}`);

  section('Account');
  row('joytree login --api-key <key>',       'Validate and save a Joytree API key');
  row('joytree logout',                      'Remove local credentials');
  row('joytree whoami',                      'Show the active account and API key scope');
  row('joytree status',                      'Show account status and project overview');
  row('joytree workspace',                   'Show your workspace plan and storage usage');

  section('API Key');
  row('joytree apikey show',                 'View your current API key and usage stats');
  row('joytree apikey rotate',               'Revoke old key and generate a new one');

  section('Deploy');
  row('joytree deploy -r <repo>',            'Deploy a GitHub repo (interactive build wizard)');
  row('joytree deploy --static',             'Skip the wizard, deploy as static site');
  row('joytree redeploy <project-id>',       'Trigger a fresh redeployment');
  row('joytree stop <deploy-id>',            'Cancel a currently running deployment');
  row('joytree autodeploy <id> --enable',    'Enable GitHub push auto-deploy');
  row('joytree autodeploy <id> --disable',   'Disable GitHub push auto-deploy');
  row('joytree deployments [project-id]',    'Show recent deployments');
  row('joytree open <project-id>',           'Open the live URL in your browser');
  row('joytree upload --dir ./myapp',        'Deploy directly from a local folder (no git)');

  section('Projects');
  row('joytree projects',                    'List all your projects');
  row('joytree inspect <project-id>',        'Show full project details');
  row('joytree delete <project-id>',         'Delete a project (irreversible)');

  section('Logs');
  row('joytree logs <project-id>',           'Fetch recent runtime logs');
  row('joytree logs <id> --follow',          'Stream live project logs');
  row('joytree logs <id> --lines 100',       'Fetch logs by line count');

  section('Environment Variables');
  row('joytree env list <project-id>',       'List project env var keys');
  row('joytree env set <id> KEY=VALUE',      'Set one or more env vars');
  row('joytree env delete <id> <KEY>',       'Delete an env var');
  row('joytree env push <project-id>',       'Push a local .env file to a project');
  row('joytree env push <id> --force',       'Replace all existing env vars');

  section('GitHub');
  row('joytree pull repos',                  'List your linked GitHub repositories');
  row('joytree pull branches <repo-url>',    'List branches for a repository');

  section('Domains');
  row('joytree domains list',                'List your custom domains');
  row('joytree domains attach <d> <id>',     'Attach a domain to a project');
  row('joytree domains verify <domain>',     'Trigger DNS verification');
  row('joytree domains remove <domain>',     'Remove a custom domain');
  row('joytree domains check <domain>',      'Check domain availability');

  section('Domain Registration');
  row('joytree domains tlds',                'List available TLDs and pricing');
  row('joytree domains register <domain>',   'Register a brand new domain');

  section('Databases');
  row('joytree db list',                     'List all databases');
  row('joytree db create --type <type>',     'Create a database (postgres/mysql/redis/mongo)');
  row('joytree db start <db-id>',            'Start a stopped database');
  row('joytree db stop <db-id>',             'Stop a running database');
  row('joytree db restart <db-id>',          'Restart a database');
  row('joytree db logs <db-id>',             'Fetch recent database logs');
  row('joytree db delete <db-id>',           'Delete a database (irreversible)');

  section('AI Agent');
  row('joytree agent providers',             'List available AI providers (Llama, GPT, Claude, Grok)');
  row('joytree agent start --prompt "..."',  'Start an AI agent session to fix or build code');
  row('joytree agent status <session-id>',   'Check on a running agent session');
  row('joytree agent followup <id> -m "..."','Send a follow-up message to an agent session');

  section('Webhooks');
  row('joytree webhook secret',              'Show your global webhook secret');
  row('joytree webhook rotate',              'Regenerate your webhook secret');

  section('SSH Keys');
  row('joytree ssh list',                    'List all SSH keys');
  row('joytree ssh generate --name <n>',     'Generate a new SSH key pair');
  row('joytree ssh delete <key-id>',         'Delete an SSH key');

  section('Billing & Support');
  row('joytree billing',                     'Show billing configuration status');
  row('joytree support -m "..."',            'Send a message to Joytree support');

  section('Activity');
  row('joytree activity',                    'Show recent platform activity feed');
  row('joytree activity --limit <n>',        'Limit number of events shown');

  console.log();
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
program.command('deploy')
  .option('-r, --repo <url>')
  .option('-b, --branch <branch>')
  .option('-n, --name <name>')
  .option('--build <cmd>')
  .option('--start <cmd>')
  .option('--static')
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
domainGroup.command('verify <domain>').action(domains.verify);
domainGroup.command('remove <domain>').action(domains.remove);
domainGroup.command('check <domain>').action(domains.check);
domainGroup.command('tlds').action(registrar.tlds);
domainGroup.command('register <domain>').option('--project-id <id>').option('--years <n>').action((domain, opts) => registrar.register({ domain, ...opts }));

// ── Databases ─────────────────────────────────────────────────────────
const dbGroup = program.command('db');
dbGroup.command('list').action(db.list);
dbGroup.command('create').option('--type <type>', '', 'postgres').option('--name <name>').action(db.create);
dbGroup.command('start <db-id>').action(db.start);
dbGroup.command('stop <db-id>').action(db.stop);
dbGroup.command('restart <db-id>').action(db.restart);
dbGroup.command('logs <db-id>').action(db.fetchLogs);
dbGroup.command('delete <db-id>').option('-y, --yes').action(db.del);

// ── AI Agent ──────────────────────────────────────────────────────────
const agentGroup = program.command('agent');
agentGroup.command('providers').action(agent.providers);
agentGroup.command('start').option('-p, --prompt <text>').option('--provider <id>').option('--project-id <id>').action(agent.start);
agentGroup.command('status <session-id>').action(agent.status);
agentGroup.command('followup <session-id>').option('-m, --message <text>').action(agent.followup);

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
