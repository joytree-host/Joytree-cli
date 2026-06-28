'use strict';

const config = require('../lib/config');
const { validateApiKey } = require('../lib/api');
const ui     = require('../lib/ui');

async function status() {
  const apiKey  = config.getApiKey();
  const baseUrl = config.getBaseUrl();
  if (!apiKey) { ui.warn('Not logged in. Run: joytree login'); return; }

  const spin = ui.spinner('Loading account status');
  try {
    const data = await validateApiKey(apiKey, baseUrl);
    spin.stop();

    const projects  = Array.isArray(data.projects) ? data.projects : [];
    const email     = config.load().email || '—';

    ui.header('Account Status');
    ui.divider();
    ui.label('Email',    email);
    ui.label('Host',     baseUrl);
    ui.label('Projects', String(projects.length));
    ui.label('API Key',  apiKey.slice(0, 8) + '…' + apiKey.slice(-4));
    console.log();

    if (projects.length) {
      ui.header('Projects');
      ui.divider();
      const base = baseUrl.replace(/^https?:\/\//, '');
      projects.slice(0, 10).forEach(p => {
        const sub = p.subdomain || p.name || p.id;
        console.log(`  ${ui.c.bold}${sub}${ui.c.reset}  ${ui.c.dim}https://${sub}.${base}${ui.c.reset}`);
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
