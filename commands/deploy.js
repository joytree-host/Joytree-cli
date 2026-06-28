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
  const apiKey = config.getApiKey();
  if (!apiKey) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

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

  // Server expects: name, subdomain, repoUrl, branch, buildCmd, startCmd, siteType
  const body = {
    name:      name,
    subdomain: name,
    repoUrl:   repo,
    branch:    branch || 'main',
    buildCmd:  build  || '',
    startCmd:  start  || '',
    siteType:  isStatic ? 'static' : (start ? 'server' : 'static'),
    installCmd: '',
    nodeVer:   '20',
  };

  const spin = ui.spinner(`Deploying ${ui.c.bold}${name}${ui.c.reset}`);
  try {
    const data = await api.post('/api/deploy', body);
    spin.stop(`Deploy started!`);
    ui.header('Deployment');
    ui.label('Project',   name);
    ui.label('Repo',      repo);
    ui.label('Branch',    branch || 'main');
    if (data.deployId || data.id) ui.label('Deploy ID', data.deployId || data.id);
    const base = config.getBaseUrl().replace(/^https?:\/\//, '');
    ui.label('URL', `https://${name}.${base}`);
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
    await api.post(`/api/projects/${projectId}/autodeploy/check`, {});
    spin.stop(`Redeploy triggered for ${ui.c.bold}${projectId}${ui.c.reset}`);
  } catch (err) {
    try {
      await api.post(`/api/projects/${projectId}/redeploy-upload`, {});
      spin.stop(`Redeploy triggered for ${ui.c.bold}${projectId}${ui.c.reset}`);
    } catch (e2) {
      spin.stop();
      ui.error(`Redeploy failed: ${err.message}`);
      process.exit(1);
    }
  }
}

async function open(projectId) {
  if (!projectId) { ui.error('Provide a project ID. Example: joytree open my-site'); process.exit(1); }
  const base = config.getBaseUrl().replace(/^https?:\/\//, '');
  const url  = `https://${projectId}.${base}`;
  ui.info(`Opening ${url}`);
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

async function listDeployments(projectId, opts) {
  const limit = parseInt(opts.limit, 10) || 10;
  const spin  = ui.spinner('Fetching deployments');
  try {
    const query = projectId ? `/api/projects/${encodeURIComponent(projectId)}/deployments?limit=${limit}` : `/api/deployments?limit=${limit}`;
    const data  = await api.get(query);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.deployments || data.items || []);
    if (!items.length) { ui.info('No deployments found.'); return; }
    ui.header(`Recent Deployments${projectId ? ' — ' + projectId : ''}`);
    ui.divider();
    items.slice(0, limit).forEach(d => {
      const ts = d.createdAt ? new Date(d.createdAt).toLocaleString() : '—';
      console.log(`  ${ui.statusBadge(d.status || d.deployStatus)}  ${ui.c.bold}${d.projectName || d.subdomain || d.projectId || '—'}${ui.c.reset}  ${ui.c.dim}${ts}${ui.c.reset}`);
      if (d.branch) console.log(`     ${ui.c.dim}branch: ${d.branch}  sha: ${String(d.sha||'').slice(0,7)}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { deployGit, redeploy, open, listDeployments };
