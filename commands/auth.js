'use strict';

const readline = require('readline');
const https    = require('https');
const http     = require('http');
const { URL }  = require('url');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function validateKey(apiKey, baseUrl) {
  const url = new URL(`${baseUrl}/api/v1/ping`);
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': `joytree-cli/${require('../package.json').version}`,
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(data.error || `HTTP ${res.statusCode}`));
          else resolve(data);
        } catch { reject(new Error('Invalid response from server')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function login(opts) {
  ui.logo();

  let apiKey  = opts.apiKey;
  const baseUrl = config.getBaseUrl();

  if (!apiKey) {
    console.log(`${ui.c.dim}Find your API key at: ${baseUrl}/dashboard/settings → API Key${ui.c.reset}\n`);
    apiKey = await prompt(`${ui.c.bold}Paste your Joytree API key:${ui.c.reset} `);
  }

  if (!apiKey || !apiKey.startsWith('jtk_')) {
    ui.error('Invalid API key format. Keys start with jtk_');
    process.exit(1);
  }

  const spin = ui.spinner('Validating API key');
  try {
    const data = await validateKey(apiKey, baseUrl);
    spin.stop();
    // Save key then fetch account info
    config.setCredentials({ apiKey, baseUrl });

    // Get account details
    const { api } = require('../lib/api');
    const accData = await api.get('/api/v1/account').catch(() => ({}));
    const acc = accData.account || {};
    if (acc.email) config.setCredentials({ apiKey, baseUrl, email: acc.email });

    ui.success(`Logged in${acc.email ? ' as ' + ui.c.bold + acc.email + ui.c.reset : ''}`);

    // Show project count
    const projData = await api.get('/api/v1/projects').catch(() => ({ projects: [] }));
    const count = (projData.projects || []).length;
    ui.info(`${count} project(s) in your workspace`);
    console.log(`\n${ui.c.dim}Run ${ui.c.cyan}joytree projects${ui.c.reset}${ui.c.dim} to see them.${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Authentication failed: ${err.message}`);
    process.exit(1);
  }
}

function logout() {
  config.clearCredentials();
  ui.success('Logged out. Credentials removed.');
}

function whoami() {
  const creds = config.load();
  if (!creds.apiKey) { ui.warn('Not logged in. Run: joytree login'); return; }
  ui.header('Current Session');
  if (creds.email) ui.label('Email',   creds.email);
  ui.label('API Key', creds.apiKey.slice(0, 8) + '…' + creds.apiKey.slice(-4));
  ui.label('Host',    creds.baseUrl || 'https://joytree.site');
  ui.label('Config',  config.CONFIG_FILE);
  console.log();
}

module.exports = { login, logout, whoami };
