'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function activity(opts) {
  const limit = parseInt(opts.limit, 10) || 20;
  const spin = ui.spinner('Fetching activity');
  try {
    const data = await api.get(`/api/v1/activity?limit=${limit}`);
    spin.stop();
    const items = data.activity || [];
    if (!items.length) { ui.info('No recent activity.'); return; }
    ui.header('Recent Activity');
    ui.divider();
    items.forEach(a => {
      const ts = a.at ? `${ui.c.dim}${new Date(a.at).toLocaleString()}${ui.c.reset}` : '';
      console.log(`  ${ui.statusBadge(a.status)}  ${ui.c.bold}${a.subdomain || a.projectId || '—'}${ui.c.reset}  ${ts}`);
      if (a.branch) console.log(`     ${ui.c.dim}branch: ${a.branch}  commit: ${a.commit||'—'}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function stopDeploy(deployId) {
  const spin = ui.spinner(`Stopping deployment ${deployId}`);
  try {
    await api.post(`/api/v1/projects/${encodeURIComponent(deployId)}/stop`, {});
    spin.stop(`Stopped ${ui.c.bold}${deployId}${ui.c.reset}`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function autodeploy(projectId, opts) {
  const enable = opts.enable ? true : opts.disable ? false : null;
  if (enable === null) {
    ui.error('Specify --enable or --disable');
    process.exit(1);
  }
  const spin = ui.spinner(`${enable ? 'Enabling' : 'Disabling'} auto-deploy for ${projectId}`);
  try {
    await api.patch(`/api/v1/projects/${encodeURIComponent(projectId)}`, { autoDeploy: enable });
    spin.stop(`Auto-deploy ${enable ? ui.c.green + 'enabled' : ui.c.yellow + 'disabled'}${ui.c.reset} for ${ui.c.bold}${projectId}${ui.c.reset}`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function apiKey() {
  const spin = ui.spinner('Fetching API key info');
  try {
    const data = await api.get('/api/v1/account');
    spin.stop();
    const acc = data.account || {};
    ui.header('API Key');
    ui.divider();
    ui.label('Email',     acc.email || '—');
    ui.label('Name',      acc.name  || '—');
    ui.label('Created',   acc.apiKey?.createdAt ? new Date(acc.apiKey.createdAt).toLocaleString() : '—');
    ui.label('Last Used', acc.apiKey?.lastUsed  ? new Date(acc.apiKey.lastUsed).toLocaleString()  : 'never');
    console.log(`\n  ${ui.c.dim}To rotate your key run: joytree apikey rotate${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function rotateApiKey() {
  const spin = ui.spinner('Rotating API key');
  try {
    const data = await api.post('/api/account/api-key/rotate', {});
    spin.stop(`API key rotated!`);
    ui.label('New Key', data.key || '—');
    ui.warn('Update your CLI: joytree login --api-key <new-key>');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { activity, stopDeploy, autodeploy, apiKey, rotateApiKey };
