'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_DIR  = path.join(os.homedir(), '.joytree');
const CONFIG_FILE = path.join(CONFIG_DIR, 'credentials.json');

function load() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getApiKey() {
  return load().apiKey || process.env.JOYTREE_API_KEY || null;
}

function getBaseUrl() {
  return load().baseUrl
    || process.env.JOYTREE_BASE_URL
    || 'https://joytree.site';
}

function setCredentials({ apiKey, baseUrl, email }) {
  const existing = load();
  save({ ...existing, apiKey, baseUrl: baseUrl || existing.baseUrl || 'https://joytree.site', email });
}

function clearCredentials() {
  save({});
}

module.exports = { load, save, getApiKey, getBaseUrl, setCredentials, clearCredentials, CONFIG_FILE };
