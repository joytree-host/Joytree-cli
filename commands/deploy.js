'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function deployGit(opts) {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  let { repo, branch, name, build, start, static: isStatic, message } = opts;

  if (!repo) {
    repo = await prompt(`${ui.c.bold}GitHub repo URL:${ui.c.reset} `);
    if (!repo) { ui.error('Repository URL is required.'); process.exit(1); }
  }

  if (!name) {
    const guessed = repo.split('/').pop().replace(/\.git$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const ans = await prompt(`${ui.c.bold}Project name/subdomain${ui.c.reset} [${guessed}]: `);
    name = ans || guessed;
  }

  const spin = ui.spinner(`Deploying ${ui.c.bold}${name}${ui.c.reset}`);

  try {
    // Call /api/deploy directly — now that requireAuth accepts jtk_ keys
    const data = await api.post('/api/deploy', {
      name,
      subdomain:  name,
      repoUrl:    repo,
      branch:     branch || 'main',
      buildCmd:   build  || '',
      startCmd:   start  || '',
      installCmd: '',
      siteType:   isStatic ? 'static' : (start ? 'server' : 'static'),
      nodeVer:    '20',
      outputDir:  '',
      workingDir: '',
      source:     'cli',
    });

    spin.stop(`Deploy started!`);
    ui.header('Deployment');
    ui.label('Project',   name);
    ui.label('Repo',      repo);
    ui.label('Branch',    branch || 'main');
    ui.label('Deploy ID', data.deployId || data.id || '—');
    ui.label('URL',       `https://${name}.joytree.site`);
    console.log(`\n${ui.c.dim}Watch logs: ${ui.c.cyan}joytree logs ${name} --follow${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Deploy failed: ${err.message}`);
    process.exit(1);
  }
}

async function redeploy(projectId) {
  const spin = ui.spinner(`Redeploying ${projectId}`);
  try {
    // Get full project details first so we can pass repoUrl etc to /api/deploy
    const ws   = await api.get('/api/v1/transfer');
    const proj = (ws.projects || []).find(p => p.subdomain === projectId || p.id === projectId || p.name === projectId);
    if (!proj) { spin.stop(); ui.error(`Project "${projectId}" not found.`); process.exit(1); }

    const data = await api.post('/api/deploy', {
      name:       proj.name      || proj.subdomain,
      subdomain:  proj.subdomain || proj.name,
      repoUrl:    proj.repoUrl,
      branch:     proj.branch    || 'main',
      buildCmd:   proj.buildCommand || proj.buildCmd || '',
      startCmd:   proj.startCommand || proj.startCmd || '',
      installCmd: proj.installCmd   || '',
      siteType:   proj.siteType     || (proj.isStatic ? 'static' : 'server'),
      nodeVer:    proj.nodeVersion  || '20',
      source:     'cli',
    });

    spin.stop(`Redeploy triggered for ${ui.c.bold}${projectId}${ui.c.reset}`);
    if (data.deployId) ui.label('Deploy ID', data.deployId);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Redeploy failed: ${err.message}`);
    process.exit(1);
  }
}

async function open(projectId) {
  if (!projectId) { ui.error('Provide a project ID. Example: joytree open my-site'); process.exit(1); }
  const url = `https://${projectId}.joytree.site`;
  ui.info(`Opening ${url}`);
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

async function listDeployments(projectId, opts) {
  const limit = parseInt(opts.limit, 10) || 10;
  const spin  = ui.spinner('Fetching deployments');
  try {
    const query = projectId
      ? `/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${limit}`
      : `/api/v1/deployments?limit=${limit}`;
    const data  = await api.get(query);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.logs || data.deployments || data.items || []);
    if (!items.length) { ui.info('No deployments found.'); return; }
    ui.header(`Recent Deployments${projectId ? ' — ' + projectId : ''}`);
    ui.divider();
    items.slice(0, limit).forEach(d => {
      const ts = d.startedAt || d.createdAt ? new Date(d.startedAt || d.createdAt).toLocaleString() : '—';
      console.log(`  ${ui.statusBadge(d.status)}  ${ui.c.bold}${d.subdomain || d.projectId || '—'}${ui.c.reset}  ${ui.c.dim}${ts}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { deployGit, redeploy, open, listDeployments };
