'use strict';

const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

async function activity(opts) {
  const limit = parseInt(opts.limit, 10) || 20;
  const spin  = ui.spinner('Fetching activity');
  try {
    const data  = await api.get(`/api/v1/activity?limit=${limit}`);
    spin.stop();
    const items = data.activity || (Array.isArray(data) ? data : []);
    if (!items.length) { ui.info('No recent activity.'); return; }
    ui.header('Recent Activity');
    ui.divider();
    items.forEach(a => {
      const ts = a.at || a.createdAt ? `${ui.c.dim}${new Date(a.at || a.createdAt).toLocaleString()}${ui.c.reset}` : '';
      console.log(`  ${ui.statusBadge(a.status)}  ${ui.c.bold}${a.subdomain || a.projectId || '—'}${ui.c.reset}  ${ts}`);
      if (a.commit) console.log(`     ${ui.c.dim}commit: ${a.commit}  branch: ${a.branch || 'main'}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function stopDeploy(projectId) {
  const spin = ui.spinner(`Stopping ${projectId}`);
  try {
    await api.post(`/api/projects/${encodeURIComponent(projectId)}/stop`, {});
    spin.stop(`Stopped ${ui.c.bold}${projectId}${ui.c.reset}.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function autodeploy(projectId, opts) {
  const enable = opts.enable ? true : opts.disable ? false : null;
  if (enable === null) { ui.error('Use --enable or --disable'); process.exit(1); }
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

async function apiKey() {
  const spin = ui.spinner('Fetching API key info');
  try {
    // Use the account/api-key endpoint — requireAuth now accepts jtk_ keys
    const data = await api.get('/api/account/api-key');
    spin.stop();
    ui.header('API Key');
    ui.divider();
    // Email comes from saved credentials or the key record
    const creds = config.load();
    ui.label('Email',     data.email    || creds.email || '—');
    ui.label('Key',       data.key ? data.key.slice(0, 12) + '…' : '—');
    ui.label('Created',   data.createdAt  ? new Date(data.createdAt).toLocaleString()  : '—');
    ui.label('Last used', data.lastUsed   ? new Date(data.lastUsed).toLocaleString()   : 'never');
    ui.label('Status',    data.disabled   ? `${ui.c.red}disabled${ui.c.reset}` : `${ui.c.green}active${ui.c.reset}`);
    ui.label('Projects',  String(data.projectCount || data.snapshot?.projectCount || 0));
    console.log(`\n${ui.c.dim}To rotate: joytree apikey rotate${ui.c.reset}\n`);
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
    ui.warn('Your old key is now revoked. Run: joytree login --api-key <new-key>');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { activity, stopDeploy, autodeploy, apiKey, rotateApiKey };
