'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function list() {
  const spin = ui.spinner('Fetching domains');
  try {
    const data = await api.get('/api/domains/mine');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.domains || []);
    if (!items.length) { ui.info('No custom domains configured.'); return; }
    ui.header(`Custom Domains (${items.length})`);
    ui.divider();
    items.forEach(d => {
      const status = d.verified ? `${ui.c.green}✓ verified${ui.c.reset}` : `${ui.c.yellow}⚠ unverified${ui.c.reset}`;
      console.log(`  ${ui.c.bold}${d.domain}${ui.c.reset}  ${status}`);
      if (d.projectId || d.subdomain) console.log(`     ${ui.c.dim}→ project: ${d.projectId || d.subdomain}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function attach(domain, projectId) {
  const spin = ui.spinner(`Attaching ${domain} to ${projectId}`);
  try {
    await api.post('/api/domains/attach', { domain, projectId });
    spin.stop(`Domain ${ui.c.bold}${domain}${ui.c.reset} attached to ${projectId}`);
    ui.info('DNS propagation may take a few minutes.');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function verify(domain) {
  const spin = ui.spinner(`Verifying ${domain}`);
  try {
    const data = await api.post(`/api/domains/${encodeURIComponent(domain)}/verify`, {});
    spin.stop();
    if (data.verified) {
      ui.success(`${domain} is verified!`);
    } else {
      ui.warn(`Verification pending. ${data.message || 'Check your DNS records.'}`);
    }
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function remove(domain) {
  const spin = ui.spinner(`Removing ${domain}`);
  try {
    await api.delete(`/api/domains/${encodeURIComponent(domain)}`);
    spin.stop(`Domain ${ui.c.bold}${domain}${ui.c.reset} removed.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function check(domain) {
  const spin = ui.spinner(`Checking availability of ${domain}`);
  try {
    const data = await api.get(`/api/domains/check?domain=${encodeURIComponent(domain)}`);
    spin.stop();
    if (data.available) {
      ui.success(`${ui.c.bold}${domain}${ui.c.reset} is ${ui.c.green}available${ui.c.reset}!`);
      if (data.price) ui.label('Price', data.price);
    } else {
      ui.warn(`${domain} is ${ui.c.red}not available${ui.c.reset}.`);
    }
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, attach, verify, remove, check };
