'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function list() {
  const spin = ui.spinner('Fetching SSH keys');
  try {
    const data = await api.get('/api/ssh-keys/list');
    spin.stop();
    const keys = Array.isArray(data) ? data : (data.keys || data.sshKeys || []);
    if (!keys.length) {
      ui.info('No SSH keys. Generate one: joytree ssh generate');
      return;
    }
    ui.header(`SSH Keys (${keys.length})`);
    ui.divider();
    keys.forEach(k => {
      console.log(`  ${ui.c.bold}${k.name || k.label || k.id}${ui.c.reset}  ${ui.c.dim}${k.id}${ui.c.reset}`);
      if (k.fingerprint) console.log(`     ${ui.c.dim}fingerprint: ${k.fingerprint}${ui.c.reset}`);
      if (k.createdAt)   console.log(`     ${ui.c.dim}created: ${new Date(k.createdAt).toLocaleString()}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function generate(opts) {
  let name = opts.name;
  if (!name) {
    name = await prompt(`${ui.c.bold}Key name/label:${ui.c.reset} `);
    if (!name) { ui.error('Name is required.'); process.exit(1); }
  }
  const spin = ui.spinner(`Generating SSH key "${name}"`);
  try {
    const data = await api.post('/api/ssh-keys/generate', { name });
    spin.stop(`SSH key generated!`);
    ui.label('Name',        data.name || name);
    ui.label('ID',          data.id || data.keyId || '—');
    if (data.publicKey) {
      ui.label('Public Key', '');
      console.log(`\n${ui.c.dim}${data.publicKey}${ui.c.reset}\n`);
      ui.info('Add this public key to your GitHub/GitLab account.');
    }
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function del(keyId, opts) {
  if (!opts.yes) {
    const ans = await prompt(`${ui.c.yellow}Delete SSH key "${keyId}"? Type yes to confirm: ${ui.c.reset}`);
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner(`Deleting SSH key ${keyId}`);
  try {
    await api.delete(`/api/ssh-keys/${encodeURIComponent(keyId)}`);
    spin.stop(`SSH key ${ui.c.bold}${keyId}${ui.c.reset} deleted.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, generate, del };
