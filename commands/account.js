'use strict';

const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

async function status() {
  const apiKey = config.getApiKey();
  if (!apiKey) { ui.warn('Not logged in. Run: joytree login'); return; }

  const spin = ui.spinner('Loading account status');
  try {
    const [accData, projData] = await Promise.all([
      api.get('/api/v1/account'),
      api.get('/api/v1/projects')
    ]);
    spin.stop();

    const acc      = accData.account || {};
    const projects = projData.projects || [];
    const base     = config.getBaseUrl().replace(/^https?:\/\//, '');

    ui.header('Account Status');
    ui.divider();
    ui.label('Email',    acc.email || config.load().email || '—');
    ui.label('Name',     acc.name  || '—');
    ui.label('Host',     config.getBaseUrl());
    ui.label('Projects', String(projects.length));
    ui.label('API Key',  apiKey.slice(0, 8) + '…' + apiKey.slice(-4));
    console.log();

    if (projects.length) {
      ui.header('Projects');
      ui.divider();
      projects.slice(0, 10).forEach(p => {
        const sub = p.subdomain || p.name || p.id;
        console.log(`  ${ui.statusBadge(p.status)}  ${ui.c.bold}${sub}${ui.c.reset}  ${ui.c.dim}https://${sub}.${base}${ui.c.reset}`);
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
