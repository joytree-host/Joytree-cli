#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

// Commands
const auth    = require('../commands/auth');
const deploy  = require('../commands/deploy');
const projects= require('../commands/projects');
const envCmd  = require('../commands/env');
const logs    = require('../commands/logs');
const domains = require('../commands/domains');
const db      = require('../commands/db');
const account = require('../commands/account');
const github  = require('../commands/github');
const webhook = require('../commands/webhook');
const ssh     = require('../commands/ssh');
const extras  = require('../commands/extras');
const ui      = require('../lib/ui');

// ── Custom help screen ────────────────────────────────────────────────
function showHelp() {
  const c = ui.c;
  ui.logo();

  console.log(`${c.bold}USAGE${c.reset}`);
  console.log(`  joytree ${c.cyan}<command>${c.reset} ${c.dim}[options]${c.reset}\n`);

  const section = (title, icon) => {
    console.log(`${c.bold}${c.white}${icon}  ${title}${c.reset}`);
  };

  const cmd = (name, args, desc) => {
    const nameCol = `${c.cyan}  joytree ${c.bold}${name}${c.reset}`;
    const argsCol = args ? ` ${c.dim}${args}${c.reset}` : '';
    const pad = Math.max(0, 42 - name.length - (args ? args.length + 1 : 0));
    console.log(`${nameCol}${argsCol}${' '.repeat(pad)}${c.dim}${desc}${c.reset}`);
  };

  // ── ACCOUNT ──
  section('Account', '◆');
  cmd('login',   '--api-key <key>',  'Validate and save your Joytree API key');
  cmd('logout',  '',                  'Remove local credentials');
  cmd('whoami',  '',                  'Show the active account and API key scope');
  cmd('status',  '',                  'Show account status and project overview');
  console.log();

  // ── API KEY ──
  section('API Key', '◆');
  cmd('apikey show',   '',  'View your current API key and usage stats');
  cmd('apikey rotate', '',  'Revoke old key and generate a new one');
  console.log();

  // ── DEPLOY ──
  section('Deploy', '◆');
  cmd('deploy',      '-r <repo> -n <name>',   'Deploy a GitHub repo to Joytree');
  cmd('redeploy',    '<project-id>',           'Trigger a fresh redeployment');
  cmd('stop',        '<deploy-id>',            'Cancel a currently running deployment');
  cmd('autodeploy',  '<project-id> --enable',  'Toggle GitHub push auto-deploy on/off');
  cmd('deployments', '[project-id]',           'Show recent deployment history');
  cmd('open',        '<project-id>',           'Open the live URL in your browser');
  console.log();

  // ── PROJECTS ──
  section('Projects', '◆');
  cmd('projects',    '',              'List all your projects');
  cmd('inspect',     '<project-id>',  'Show full project details');
  cmd('delete',      '<project-id>',  'Delete a project (irreversible)');
  console.log();

  // ── LOGS ──
  section('Logs', '◆');
  cmd('logs',  '<project-id>',           'Fetch recent runtime logs');
  cmd('logs',  '<project-id> --follow',  'Stream live logs in real time');
  console.log();

  // ── ENV VARS ──
  section('Environment Variables', '◆');
  cmd('env list',    '<project-id>',            'List all env var keys');
  cmd('env set',     '<project-id> KEY=VALUE',  'Set one or more env vars');
  cmd('env delete',  '<project-id> <KEY>',      'Delete an env var');
  cmd('env push',    '<project-id>',            'Push a local .env file to a project');
  console.log();

  // ── GITHUB ──
  section('GitHub', '◆');
  cmd('pull repos',     '',           'List your linked GitHub repositories');
  cmd('pull branches',  '<repo-url>', 'List branches for a repository');
  console.log();

  // ── DOMAINS ──
  section('Domains', '◆');
  cmd('domains list',    '',                        'List your custom domains');
  cmd('domains attach',  '<domain> <project-id>',   'Attach a domain to a project');
  cmd('domains verify',  '<domain>',                'Trigger DNS verification');
  cmd('domains remove',  '<domain>',                'Remove a custom domain');
  cmd('domains check',   '<domain>',                'Check domain availability');
  console.log();

  // ── DATABASES ──
  section('Databases', '◆');
  cmd('db list',     '',        'List all databases');
  cmd('db create',   '--type',  'Create a new database (postgres/mysql/redis/mongo)');
  cmd('db start',    '<db-id>', 'Start a stopped database');
  cmd('db stop',     '<db-id>', 'Stop a running database');
  cmd('db restart',  '<db-id>', 'Restart a database');
  cmd('db logs',     '<db-id>', 'Fetch recent database logs');
  cmd('db delete',   '<db-id>', 'Delete a database (irreversible)');
  console.log();

  // ── WEBHOOK ──
  section('Webhooks', '◆');
  cmd('webhook secret', '', 'Show your global webhook secret');
  cmd('webhook rotate', '', 'Regenerate your webhook secret');
  console.log();

  // ── SSH ──
  section('SSH Keys', '◆');
  cmd('ssh list',      '',          'List all SSH keys');
  cmd('ssh generate',  '--name',    'Generate a new SSH key pair');
  cmd('ssh delete',    '<key-id>',  'Delete an SSH key');
  console.log();

  // ── ACTIVITY ──
  section('Activity', '◆');
  cmd('activity', '--limit <n>', 'Show recent platform activity feed');
  console.log();

  // ── FOOTER ──
  console.log(`${c.dim}  Run ${c.cyan}joytree <command> --help${c.dim} for detailed options on any command.${c.reset}`);
  console.log(`${c.dim}  Docs: ${c.cyan}https://docs.joytree.app${c.reset}\n`);
}

program
  .name('joytree')
  .description('Joytree CLI — deploy and manage your projects from the terminal')
  .version(pkg.version)
  .helpOption(false)
  .addHelpCommand(false)
  .option('-h, --help', 'Show this help screen')
  .hook('preAction', (thisCommand) => {
    if (thisCommand.opts().help) { showHelp(); process.exit(0); }
  });

// Override default --help
program.on('--help', showHelp);

// Show custom help when no args given
if (process.argv.length === 2) {
  showHelp();
  process.exit(0);
}

// ── Auth ──────────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with your Joytree API key')
  .option('--api-key <key>', 'Provide API key directly (skips prompt)')
  .action(auth.login);

program
  .command('logout')
  .description('Remove saved credentials')
  .action(auth.logout);

program
  .command('whoami')
  .description('Show the active account and API key scope')
  .action(auth.whoami);

program
  .command('status')
  .description('Show account status, plan, and project count')
  .action(account.status);

// ── API Key ───────────────────────────────────────────────────────────
const apikeyGroup = program
  .command('apikey')
  .description('Manage your Joytree API key');

apikeyGroup.command('show').description('Show your current API key and usage info').action(extras.apiKey);
apikeyGroup.command('rotate').description('Generate a new API key and revoke the old one').action(extras.rotateApiKey);

// ── Activity ──────────────────────────────────────────────────────────
program
  .command('activity')
  .description('Show recent platform activity')
  .option('--limit <n>', 'Number of events to show', '20')
  .action(extras.activity);

// ── GitHub ────────────────────────────────────────────────────────────
const pullGroup = program.command('pull').description('Browse connected GitHub repos and branches');
pullGroup.command('repos').description('List your linked GitHub repositories').action(github.repos);
pullGroup.command('branches <repo-url>').description('List branches for a repository').action(github.branches);

// ── Deploy ────────────────────────────────────────────────────────────
program
  .command('deploy')
  .description('Deploy a GitHub repository to Joytree')
  .option('-r, --repo <url>', 'GitHub repository URL')
  .option('-b, --branch <branch>', 'Branch to deploy', 'main')
  .option('-n, --name <name>', 'Project name / subdomain')
  .option('--build <cmd>', 'Build command')
  .option('--start <cmd>', 'Start command')
  .option('--static', 'Mark as a static site')
  .option('-m, --message <msg>', 'Deployment message')
  .action(deploy.deployGit);

program.command('redeploy <project-id>').description('Trigger a fresh deployment').action(deploy.redeploy);
program.command('stop <deploy-id>').description('Stop a currently running deployment').action(extras.stopDeploy);
program
  .command('autodeploy <project-id>')
  .description('Toggle GitHub push auto-deploy')
  .option('--enable',  'Enable auto-deploy')
  .option('--disable', 'Disable auto-deploy')
  .action(extras.autodeploy);
program.command('open [project-id]').description('Open the live URL in your browser').action(deploy.open);
program
  .command('deployments [project-id]')
  .description('Show recent deployments')
  .option('--limit <n>', 'Number to show', '10')
  .action(deploy.listDeployments);

// ── Projects ──────────────────────────────────────────────────────────
program.command('projects').description('List all your projects').option('--json', 'Output raw JSON').action(projects.list);
program.command('inspect <project-id>').description('Show full project details').action(projects.inspect);
program.command('delete <project-id>').description('Delete a project (irreversible)').option('-y, --yes', 'Skip confirmation').action(projects.deleteProject);

// ── Logs ──────────────────────────────────────────────────────────────
program
  .command('logs <project-id>')
  .description('Fetch runtime logs for a project')
  .option('--lines <n>', 'Number of lines', '50')
  .option('-f, --follow', 'Stream live logs')
  .action(logs.fetchLogs);

// ── Env ───────────────────────────────────────────────────────────────
const envGroup = program.command('env').description('Manage environment variables');
envGroup.command('list <project-id>').description('List all env var keys').action(envCmd.list);
envGroup.command('set <project-id> <KEY=VALUE...>').description('Set one or more env vars').action(envCmd.set);
envGroup.command('delete <project-id> <KEY>').description('Delete an env var').action(envCmd.del);
envGroup.command('push <project-id>').description('Push a .env file').option('--file <path>', 'Path to .env file', '.env').option('--force', 'Overwrite all existing vars').action(envCmd.push);

// ── Domains ───────────────────────────────────────────────────────────
const domainGroup = program.command('domains').description('Manage custom domains');
domainGroup.command('list').description('List your custom domains').action(domains.list);
domainGroup.command('attach <domain> <project-id>').description('Attach a domain to a project').action(domains.attach);
domainGroup.command('verify <domain>').description('Trigger DNS verification').action(domains.verify);
domainGroup.command('remove <domain>').description('Remove a custom domain').action(domains.remove);
domainGroup.command('check <domain>').description('Check domain availability').action(domains.check);

// ── Databases ─────────────────────────────────────────────────────────
const dbGroup = program.command('db').description('Manage databases');
dbGroup.command('list').description('List all databases').action(db.list);
dbGroup.command('create').description('Create a new database').option('--type <type>', 'Database type', 'postgres').option('--name <name>', 'Database name').action(db.create);
dbGroup.command('start <db-id>').description('Start a stopped database').action(db.start);
dbGroup.command('stop <db-id>').description('Stop a running database').action(db.stop);
dbGroup.command('restart <db-id>').description('Restart a database').action(db.restart);
dbGroup.command('logs <db-id>').description('Fetch database logs').action(db.fetchLogs);
dbGroup.command('delete <db-id>').description('Delete a database').option('-y, --yes', 'Skip confirmation').action(db.del);

// ── Webhook ───────────────────────────────────────────────────────────
const webhookGroup = program.command('webhook').description('Manage GitHub webhook secrets');
webhookGroup.command('secret').description('Show your global webhook secret').action(webhook.getSecret);
webhookGroup.command('rotate').description('Regenerate your webhook secret').action(webhook.rotateSecret);

// ── SSH ───────────────────────────────────────────────────────────────
const sshGroup = program.command('ssh').description('Manage SSH keys');
sshGroup.command('list').description('List all SSH keys').action(ssh.list);
sshGroup.command('generate').description('Generate a new SSH key pair').option('--name <name>', 'Key name/label').action(ssh.generate);
sshGroup.command('delete <key-id>').description('Delete an SSH key').option('-y, --yes', 'Skip confirmation').action(ssh.del);

program.parseAsync(process.argv).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
