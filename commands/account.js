'use strict';

const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

async function status() {
  if (!config.getApiKey()) { ui.warn('Not logged in. Run: joytree login'); return; }
  const spin = ui.spinner('Loading account status');
  try {
    const [account, workspace] = await Promise.all([
      api.get('/api/v1/account'),
      api.get('/api/v1/projects'),
    ]);
    spin.stop();
    const projects = Array.isArray(workspace) ? workspace : (workspace.projects || []);
    ui.header('Account Status');
    ui.divider();
    ui.label('Email',    account.email || config.load().email || '—');
    ui.label('Plan',     account.plan  || 'free');
    ui.label('Projects', String(projects.length));
    ui.label('Host',     config.getBaseUrl());
    console.log();
    if (projects.length) {
      ui.header('Projects');
      ui.divider();
      projects.slice(0, 10).forEach(p => {
        const sub = p.subdomain || p.name || p.id;
        console.log(`  ${ui.c.bold}${sub}${ui.c.reset}  ${ui.c.dim}https://${sub}.joytree.site${ui.c.reset}`);
      });
      if (projects.length > 10) ui.info(`… and ${projects.length - 10} more. Run: joytree projects`);
      console.log();
    }
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { status };
