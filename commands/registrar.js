'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function tlds() {
  const spin = ui.spinner('Fetching available TLD pricing');
  try {
    const data = await api.get('/api/domains/tlds');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.tlds || []);
    if (!items.length) { ui.info('No TLD pricing data available.'); return; }
    ui.header(`Available TLDs (${items.length})`);
    ui.divider();
    items.slice(0, 40).forEach(t => {
      const tld   = t.tld || t.name;
      const price = t.price || t.registerPrice || '—';
      console.log(`  ${ui.c.bold}.${tld.replace(/^\./, '')}${ui.c.reset}  ${ui.c.dim}${price}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function register(opts) {
  let { domain, projectId, years } = opts;
  if (!domain) {
    domain = await prompt(`${ui.c.bold}Domain to register (e.g. mysite.com):${ui.c.reset} `);
    if (!domain) { ui.error('Domain is required.'); process.exit(1); }
  }
  const spin = ui.spinner(`Registering ${ui.c.bold}${domain}${ui.c.reset}`);
  try {
    const data = await api.post('/api/domains/register', { domain, projectId, years: years || 1 });
    spin.stop(`Domain registration started for ${ui.c.bold}${domain}${ui.c.reset}!`);
    ui.label('Status', data.status || 'pending');
    if (data.orderId) ui.label('Order ID', data.orderId);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Registration failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { tlds, register };
