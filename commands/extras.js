'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

// ── Activity feed ─────────────────────────────────────────────────────
async function activity(opts) {
  const limit = parseInt(opts.limit, 10) || 20;
  const spin = ui.spinner('Fetching activity');
  try {
    const data = await api.get(`/api/activity?limit=${limit}`);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.activity || data.events || data.items || []);
    if (!items.length) { ui.info('No recent activity.'); return; }
    ui.header('Recent Activity');
    ui.divider();
    items.slice(0, limit).forEach(a => {
      const ts  = a.createdAt || a.timestamp ? `${ui.c.dim}${new Date(a.createdAt || a.timestamp).toLocaleString()}${ui.c.reset}` : '';
      const type = a.type || a.event || '';
      const project = a.projectName || a.subdomain || a.projectId || '';
      console.log(`  ${ui.c.bold}${type}${ui.c.reset}${project ? '  ' + project : ''}  ${ts}`);
      if (a.message || a.description) console.log(`     ${ui.c.dim}${a.message || a.description}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Stop a running deployment ─────────────────────────────────────────
async function stopDeploy(deployId) {
  const spin = ui.spinner(`Stopping deployment ${deployId}`);
  try {
    await api.post(`/api/deploy/${encodeURIComponent(deployId)}/stop`, {});
    spin.stop(`Deployment ${ui.c.bold}${deployId}${ui.c.reset} stopped.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Autodeploy toggle ─────────────────────────────────────────────────
async function autodeploy(projectId, opts) {
  const enable = opts.enable !== undefined ? true : opts.disable !== undefined ? false : null;
  if (enable === null) {
    ui.error('Specify --enable or --disable. Example: joytree autodeploy my-site --enable');
    process.exit(1);
  }
  const spin = ui.spinner(`${enable ? 'Enabling' : 'Disabling'} auto-deploy for ${projectId}`);
  try {
    await api.post(`/api/projects/${encodeURIComponent(projectId)}/autodeploy`, { enabled: enable });
    spin.stop(`Auto-deploy ${enable ? ui.c.green + 'enabled' : ui.c.yellow + 'disabled'}${ui.c.reset} for ${ui.c.bold}${projectId}${ui.c.reset}`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── API key management ────────────────────────────────────────────────
async function apiKey() {
  const spin = ui.spinner('Fetching API key');
  try {
    const data = await api.get('/api/account/api-key');
    spin.stop();
    ui.header('API Key');
    ui.divider();
    ui.label('Key',        data.key || '—');
    ui.label('Created',    data.createdAt ? new Date(data.createdAt).toLocaleString() : '—');
    ui.label('Last Used',  data.lastUsed  ? new Date(data.lastUsed).toLocaleString()  : 'never');
    ui.label('Status',     data.disabled ? `${ui.c.red}disabled${ui.c.reset}` : `${ui.c.green}active${ui.c.reset}`);
    ui.label('Projects',   String(data.projectCount || 0));
    if (data.transferUrl)  ui.label('Transfer URL', data.transferUrl);
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
    ui.warn('Your old key is now revoked. Update your CLI: joytree login --api-key <new-key>');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { activity, stopDeploy, autodeploy, apiKey, rotateApiKey };
