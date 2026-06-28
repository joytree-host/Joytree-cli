'use strict';

const readline   = require('readline');
const config     = require('../lib/config');
const { validateApiKey } = require('../lib/api');
const ui         = require('../lib/ui');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function login(opts) {
  ui.logo();

  let apiKey = opts.apiKey;
  let baseUrl = config.getBaseUrl();

  if (!apiKey) {
    console.log(`${ui.c.dim}Find your API key at: ${baseUrl}/dashboard → Settings → API Key${ui.c.reset}\n`);
    apiKey = await prompt(`${ui.c.bold}Paste your Joytree API key:${ui.c.reset} `);
  }

  if (!apiKey || !apiKey.startsWith('jtk_')) {
    ui.error('Invalid API key format. Keys start with jtk_');
    process.exit(1);
  }

  const spin = ui.spinner('Validating API key');
  try {
    const data = await validateApiKey(apiKey, baseUrl);
    spin.stop();
    const email = (data.projects && data.email) || (Array.isArray(data) ? '' : data.email) || '';
    const projects = Array.isArray(data.projects) ? data.projects.length : (data.projectCount || 0);
    config.setCredentials({ apiKey, baseUrl, email });
    ui.success(`Logged in${email ? ' as ' + ui.c.bold + email + ui.c.reset : ''}`);
    ui.info(`${projects} project(s) in your workspace`);
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
  if (!creds.apiKey) {
    ui.warn('Not logged in. Run: joytree login');
    return;
  }
  ui.header('Current Session');
  if (creds.email) ui.label('Email',   creds.email);
  ui.label('API Key', creds.apiKey.slice(0, 8) + '…' + creds.apiKey.slice(-4));
  ui.label('Host',    creds.baseUrl || 'https://joytree.site');
  ui.label('Config',  config.CONFIG_FILE);
  console.log();
}

module.exports = { login, logout, whoami };
