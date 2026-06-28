'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function getSecret() {
  const spin = ui.spinner('Fetching global webhook secret');
  try {
    const data = await api.get('/api/webhook/global-secret');
    spin.stop();
    ui.header('Global Webhook Secret');
    ui.divider();
    ui.label('Secret', data.secret || data.webhookSecret || '—');
    if (data.webhookUrl) ui.label('Webhook URL', data.webhookUrl);
    console.log(`\n  ${ui.c.dim}Use this secret to verify incoming webhook payloads from GitHub.${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function rotateSecret() {
  const spin = ui.spinner('Rotating webhook secret');
  try {
    const data = await api.post('/api/webhook/global-secret/regenerate', {});
    spin.stop(`Webhook secret rotated!`);
    ui.label('New Secret', data.secret || data.webhookSecret || '—');
    ui.warn('Update this secret in your GitHub webhook settings.');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { getSecret, rotateSecret };
