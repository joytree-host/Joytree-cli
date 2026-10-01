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
const blueprint  = require('../commands/blueprint');
const firewall   = require('../commands/firewall');
const observe    = require('../commands/observe');
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
  row('joytree deploy --worker --start ..',  'Deploy a Background Worker (no public URL)');
  row('joytree deploy --dockerfile [path]',  'Build from a Dockerfile (--port, --docker-cmd)');
  row('joytree deploy -e KEY=VALUE -y',      'Set env vars; -y skips every prompt (CI-friendly)');

  section('\u25c6', 'Blueprints (joytree.joy)');
  row('joytree blueprint plan',              'Preview a Blueprint - nothing is created');
  row('joytree blueprint deploy',            'Deploy all its services and databases at once');
  row('joytree blueprint browse [dir]',      'List repo files to find a Blueprint');

  section('\u25c6', 'Firewall (Pro plan and above)');
  row('joytree firewall show <project>',     'Rules, blocked IPs, protections, Attack Mode');
  row('joytree firewall rule add <project>', 'Add a rule: --name --if "path starts_with /x" --action');
  row('joytree firewall rule enable|disable|delete', 'Manage a rule by id or name');
  row('joytree firewall rule move <p> <rule>', 'Reorder: --to <n> | --top | --bottom');
  row('joytree firewall block <p> <ips...>', 'Block IPs / CIDRs (--expires 24h --note ..)');
  row('joytree firewall unblock <p> <ips..>','Remove IPs from the block list');
  row('joytree firewall bypass add|remove',  'Manage the bypass (allow-through) list');
  row('joytree firewall set <p> ddos k=v',   'Update bots | ddos | owasp | headers | responses');
  row('joytree firewall attack <p> on|off',  'Toggle Attack Mode (--minutes 15|60|360|1440)');
  row('joytree firewall test <project>',     'Dry-run a request: --path --ip --country ..');
  row('joytree firewall events <project>',   'Recent firewall events (--action deny)');
  row('joytree firewall analytics <project>','Allowed / blocked counts and top offenders');
  row('joytree firewall insights <project>', 'Automatic hardening recommendations');

  section('\u25c6', 'Observability');
  row('joytree observe summary',             'Traffic, errors and latency across projects');
  row('joytree observe resources',           'Live CPU / memory / uptime per project and DB');
  row('joytree observe series <metric>',     'One metric over time with a chart (--range 6h)');
  row('joytree observe requests --status 5xx','Search recent requests; --group-by path');
  row('joytree observe cache',               'CDN cache hit rate and top missed assets');
  row('joytree observe alerts',              'Alert rules, their state and history');
  row('joytree observe alert add|update|delete','Manage alert rules (--webhook https://..)');
  row('joytree metrics <project>',           'Live container metrics for one project');

  section('\u25c6', 'Rollback & CDN');
  row('joytree rollback <deployment-id>',    'Redeploy an earlier successful build (see ids in `deployments`)');
  row('joytree cdn <project> status|on|off', 'Check or toggle the CDN for a project');
  row('joytree cdn <project> purge',         'Clear cached copies so visitors get fresh content');

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
// -- Blueprints ----------------------------------------------------------
const blueprintGroup = program.command('blueprint');
const withBlueprintSource = (cmd) => cmd
  .option('-r, --repo <url>', 'GitHub repo (default: this folder\'s git remote)')
  .option('-b, --branch <branch>', 'Branch (default: current branch)')
  .option('-f, --file <path>', 'Blueprint path if it is not joytree.joy at the repo root')
  .option('--json', 'Print the raw JSON response');
withBlueprintSource(blueprintGroup.command('plan')).action(blueprint.plan);
withBlueprintSource(blueprintGroup.command('deploy'))
  .option('-e, --env <SERVICE.KEY=VALUE>', 'Value for a required env var (repeatable)', collectOpt, [])
  .option('--rename-service <old=new>', 'Deploy a service under a different name (repeatable)', collectOpt, [])
  .option('--rename-db <old=new>', 'Create a database under a different name (repeatable)', collectOpt, [])
  .option('-y, --yes', 'Skip prompts and the confirmation')
  .action(blueprint.deploy);
withBlueprintSource(blueprintGroup.command('browse [dir]')).action(blueprint.browse);

// -- Firewall --------------------------------------------------------------
const fwGroup = program.command('firewall').alias('fw');
const jsonFlag = (cmd) => cmd.option('--json', 'Print the raw JSON response');
jsonFlag(fwGroup.command('show <project>')).action(firewall.show);

const fwRule = fwGroup.command('rule');
fwRule.command('add <project>')
  .option('--name <name>', 'Rule name')
  .option('--description <text>')
  .option('--if <condition>', 'Condition "<field> <op> <value>", e.g. "path starts_with /admin" (repeatable; all must match)', collectOpt, [])
  .option('--action <type>', 'log | deny | challenge | bypass | rate_limit | redirect')
  .option('--status <code>', 'deny / redirect status code')
  .option('--message <text>', 'deny message')
  .option('--requests <n>', 'rate_limit: max requests per window')
  .option('--window <seconds>', 'rate_limit: window length in seconds')
  .option('--by <key>', 'rate_limit: count per ip | ip_ua | path_ip | header')
  .option('--header-name <name>', 'rate_limit: header to count by when --by header')
  .option('--on-exceed <action>', 'rate_limit: deny | challenge | log')
  .option('--location <url>', 'redirect target (https://... or /path)')
  .option('--disabled', 'Create the rule switched off')
  .option('--rule <json>', 'Full rule as JSON, or @file.json (replaces the flags above)')
  .action(firewall.ruleAdd);
fwRule.command('enable <project> <rule>').action(firewall.ruleEnable);
fwRule.command('disable <project> <rule>').action(firewall.ruleDisable);
fwRule.command('delete <project> <rule>').action(firewall.ruleDelete);
fwRule.command('move <project> <rule>')
  .option('--to <position>', 'New position, starting at 1')
  .option('--top', 'Move to the top')
  .option('--bottom', 'Move to the bottom')
  .action(firewall.ruleMove);

fwGroup.command('block <project> <ips...>')
  .option('--host <hostname>', 'Only for this hostname (default: all)')
  .option('--note <text>')
  .option('--expires <when>', 'never | 1h | 24h | 7d | 30d')
  .action(firewall.block);
fwGroup.command('unblock <project> <ips...>').action(firewall.unblock);
const fwBypass = fwGroup.command('bypass');
fwBypass.command('add <project> <ips...>').option('--host <hostname>').option('--note <text>').action(firewall.bypassAdd);
fwBypass.command('remove <project> <ips...>').action(firewall.bypassRemove);

fwGroup.command('set <project> <section> <settings...>').description('section: bots | ddos | owasp | headers | responses; settings: key=value (dotted for nested)').action(firewall.set);
fwGroup.command('attack <project> <state>').option('--minutes <n>', '15 | 60 | 360 | 1440').action(firewall.attack);
jsonFlag(fwGroup.command('test <project>'))
  .option('--path <path>', 'Request path, e.g. /admin?x=1')
  .option('--method <method>')
  .option('--ip <ip>')
  .option('--country <code>')
  .option('--host <hostname>')
  .option('--ua <user-agent>')
  .option('--referer <url>')
  .option('--scheme <http|https>')
  .option('--rule-json <json>', 'Test an unsaved rule instead (JSON, or @file.json)')
  .action(firewall.test);
jsonFlag(fwGroup.command('events <project>'))
  .option('--limit <n>').option('--action <action>').option('--source <source>').option('--q <text>')
  .action(firewall.events);
jsonFlag(fwGroup.command('analytics <project>')).option('--range <range>', 'e.g. 1h, 24h, 7d').action(firewall.analytics);
jsonFlag(fwGroup.command('insights <project>')).action(firewall.insights);

// -- Observability, rollback, CDN -------------------------------------------
const obsGroup = program.command('observe');
const rangeOpt = (cmd) => cmd.option('--range <range>', '15m | 1h | 6h | 24h | 7d | 30d').option('--project <project>', 'Limit to one project (id or subdomain)').option('--json', 'Print the raw JSON response');
rangeOpt(obsGroup.command('summary')).action(observe.summary);
obsGroup.command('resources').option('--json').action(observe.resources);
rangeOpt(obsGroup.command('series <metric>')).option('--resource <key>', 'For cpu / mem_* / net_*: key from `observe resources`').action(observe.series);
rangeOpt(obsGroup.command('requests'))
  .option('--status <filter>', '5xx | 4xx | error | comma-separated codes')
  .option('--method <method>').option('--path <path>').option('--cache <status>', 'HIT | MISS | BYPASS | DYNAMIC | REVALIDATED')
  .option('--country <code>').option('--min-ms <n>', 'Only requests slower than this').option('--limit <n>')
  .option('--sort <key>', 'time | duration | bytes')
  .option('--group-by <field>', 'path | status | status_class | method | country | cache | project')
  .option('--metric <metric>', 'With --group-by: count | errors | error_rate | avg_ms | p95_ms | bytes')
  .action(observe.requests);
rangeOpt(obsGroup.command('cache')).action(observe.cache);
obsGroup.command('alerts').option('--json').action(observe.alerts);
const alertGroup = obsGroup.command('alert');
const alertFlags = (cmd) => cmd
  .option('--name <name>').option('--metric <metric>', 'down, requests, errors, error_rate, latency_p95, cpu, mem_pct ...')
  .option('--op <op>', '> or <').option('--threshold <n>').option('--window <minutes>', 'Evaluation window, 1-60 (default 5)')
  .option('--severity <level>', 'warning | critical').option('--target <target>', 'all | project:<id> | database:<id>')
  .option('--webhook <url>', 'https:// URL called when the alert fires and resolves');
alertFlags(alertGroup.command('add')).option('--disabled', 'Create it switched off').action(observe.alertAdd);
alertFlags(alertGroup.command('update <rule>')).option('--clear-webhook', 'Remove the webhook').option('--enable').option('--disable').action(observe.alertUpdate);
alertGroup.command('delete <rule>').option('-y, --yes').action(observe.alertDelete);
program.command('metrics <project>').option('--json').action(observe.metrics);
program.command('rollback <deployment-id>').option('-y, --yes', 'Skip the confirmation').action(observe.rollback);
program.command('cdn <project> <action>').description('action: status | on | off | purge').action(observe.cdn);

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
