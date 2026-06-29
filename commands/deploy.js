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
    // Step 1: import the project via v1 API
    const importBody = {
      project: {
        name,
        subdomain: name,
        repoUrl:      repo,
        branch:       branch || 'main',
        buildCommand: build  || '',
        startCommand: start  || '',
        isStatic:     !!isStatic,
        autoDeploy:   false,
      },
      source: 'cli'
    };
    const imported = await api.post('/api/v1/import', importBody);
    const projectId = imported.project?.id || imported.project?.subdomain || name;

    // Step 2: trigger a redeploy to actually build it
    await api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/redeploy`, {});

    spin.stop(`Deploy started!`);
    ui.header('Deployment');
    ui.label('Project',  name);
    ui.label('Repo',     repo);
    ui.label('Branch',   branch || 'main');
    ui.label('URL',      `https://${name}.joytree.site`);
    console.log(`\n${ui.c.dim}Watch logs: ${ui.c.cyan}joytree logs ${name} --follow${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    // If project already exists just trigger redeploy
    if (err.message && err.message.includes('already exists')) {
      try {
        const spin2 = ui.spinner(`Project exists — triggering redeploy`);
        await api.post(`/api/v1/projects/${encodeURIComponent(name)}/redeploy`, {});
        spin2.stop(`Redeploy triggered for ${ui.c.bold}${name}${ui.c.reset}`);
        ui.label('URL', `https://${name}.joytree.site`);
        console.log();
      } catch (e2) {
        ui.error(`Deploy failed: ${e2.message}`);
        process.exit(1);
      }
    } else {
      ui.error(`Deploy failed: ${err.message}`);
      process.exit(1);
    }
  }
}

async function redeploy(projectId) {
  const spin = ui.spinner(`Redeploying ${projectId}`);
  try {
    await api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/redeploy`, {});
    spin.stop(`Redeploy triggered for ${ui.c.bold}${projectId}${ui.c.reset}`);
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
    const items = Array.isArray(data) ? data : (data.deployments || data.logs || data.items || []);
    if (!items.length) { ui.info('No deployments found.'); return; }
    ui.header(`Recent Deployments${projectId ? ' — ' + projectId : ''}`);
    ui.divider();
    items.slice(0, limit).forEach(d => {
      const ts = d.createdAt || d.startedAt ? new Date(d.createdAt || d.startedAt).toLocaleString() : '—';
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
