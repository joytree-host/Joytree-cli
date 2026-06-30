'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

// ── Workspace info ─────────────────────────────────────────────────────────
async function workspace() {
  const spin = ui.spinner('Fetching workspace');
  try {
    const data = await api.get('/api/workspace');
    spin.stop();
    ui.header('Workspace');
    ui.divider();
    ui.label('Plan',     data.plan || 'free');
    ui.label('Projects', String((data.projects || []).length));
    ui.label('Storage',  data.storageUsed || '—');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Support ────────────────────────────────────────────────────────────────
async function support(opts) {
  let message = opts.message;
  if (!message) {
    message = await prompt(`${ui.c.bold}Message to support:${ui.c.reset} `);
    if (!message) { ui.error('A message is required.'); process.exit(1); }
  }
  const spin = ui.spinner('Sending message to support');
  try {
    await api.post('/api/support/message', { message }, { noAuth: false });
    spin.stop('Message sent! We will get back to you by email.');
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Billing ────────────────────────────────────────────────────────────────
async function billingConfig() {
  const spin = ui.spinner('Fetching billing info');
  try {
    const data = await api.get('/api/billing/paystack/config');
    spin.stop();
    ui.header('Billing');
    ui.divider();
    ui.label('Configured', data.configured ? `${ui.c.green}yes${ui.c.reset}` : `${ui.c.yellow}no${ui.c.reset}`);
    console.log(`\n  ${ui.c.dim}Manage billing and plans from the dashboard: https://joytree.site/dashboard/billing${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Upload deploy (deploy from local folder, like pxxl's tarball upload) ──
async function uploadDeploy(opts) {
  const dir  = opts.dir || process.cwd();
  let { name } = opts;

  if (!fs.existsSync(dir)) { ui.error(`Directory not found: ${dir}`); process.exit(1); }
  if (!name) {
    const guessed = path.basename(path.resolve(dir)).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    name = await prompt(`${ui.c.bold}Project name/subdomain${ui.c.reset} [${guessed}]: `);
    name = name || guessed;
  }

  const spin = ui.spinner(`Packaging ${ui.c.bold}${dir}${ui.c.reset}`);
  try {
    // Build a tar.gz of the directory in memory then upload as base64
    const { execSync } = require('child_process');
    const tmpFile = path.join(require('os').tmpdir(), `joytree-upload-${Date.now()}.tar.gz`);
    execSync(`tar -czf "${tmpFile}" -C "${dir}" --exclude=node_modules --exclude=.git .`, { stdio: 'ignore' });
    const fileBuffer = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);

    spin.stop();
    const spin2 = ui.spinner(`Uploading ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    const data  = await api.post('/api/upload-project', {
      name,
      subdomain: name,
      fileBase64: fileBuffer.toString('base64'),
    });
    spin2.stop(`Uploaded! Deploying now...`);

    const deploySpin = ui.spinner('Triggering deploy');
    await api.post('/api/upload-deploy', { projectId: data.projectId || name });
    deploySpin.stop(`Deploy started for ${ui.c.bold}${name}${ui.c.reset}`);
    ui.label('URL', `https://${name}.joytree.site`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Upload deploy failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { workspace, support, billingConfig, uploadDeploy };
