'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

function printLogLines(entries) {
  if (!Array.isArray(entries)) return;
  entries.forEach(entry => {
    const ts  = entry.startedAt || entry.timestamp
      ? `${ui.c.dim}[${new Date(entry.startedAt || entry.timestamp).toLocaleTimeString()}]${ui.c.reset} `
      : '';
    const status = (entry.status || '').toLowerCase();
    const msg = entry.message || entry.text || entry.subdomain
      ? `${entry.subdomain || ''} — ${entry.status || ''} ${entry.branch ? '(' + entry.branch + ')' : ''}`
      : String(entry);
    const colored = status === 'failed' || status === 'error'
      ? `${ui.c.red}${msg}${ui.c.reset}`
      : status === 'success' || status === 'live'
      ? `${ui.c.green}${msg}${ui.c.reset}`
      : msg;
    console.log(`${ts}${colored}`);
  });
}

async function fetchLogs(projectId, opts) {
  const limit = parseInt(opts.lines, 10) || 50;

  if (opts.follow) {
    ui.info(`Streaming logs for ${ui.c.bold}${projectId}${ui.c.reset} (Ctrl+C to stop)`);
    ui.divider();
    let seenIds = new Set();
    const poll = async () => {
      try {
        const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${limit}`);
        const entries = data.logs || [];
        const fresh = entries.filter(e => {
          const key = e.id || e.deployId || (e.startedAt + e.status);
          if (seenIds.has(key)) return false;
          seenIds.add(key);
          return true;
        });
        if (fresh.length) printLogLines(fresh);
      } catch (err) {
        ui.warn(`Log fetch error: ${err.message}`);
      }
    };
    await poll();
    const iv = setInterval(poll, 3000);
    process.on('SIGINT', () => { clearInterval(iv); console.log('\n'); process.exit(0); });
    await new Promise(() => {});
    return;
  }

  const spin = ui.spinner(`Fetching logs for ${projectId}`);
  try {
    const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${limit}`);
    spin.stop();
    const entries = data.logs || [];
    if (!entries.length) { ui.info('No log entries found.'); return; }
    ui.header(`Logs — ${projectId} (last ${entries.length})`);
    ui.divider();
    printLogLines(entries);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { fetchLogs };
