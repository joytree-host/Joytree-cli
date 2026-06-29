'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

function printLogLines(lines) {
  if (!Array.isArray(lines)) return;
  lines.forEach(entry => {
    const ts  = entry.timestamp ? `${ui.c.dim}[${new Date(entry.timestamp).toLocaleTimeString()}]${ui.c.reset} ` : '';
    const lvl = (entry.level || '').toLowerCase();
    const msg = entry.message || entry.text || String(entry);
    const colored = lvl === 'error' || lvl === 'stderr' ? `${ui.c.red}${msg}${ui.c.reset}`
                  : lvl === 'warn' ? `${ui.c.yellow}${msg}${ui.c.reset}` : msg;
    console.log(`${ts}${colored}`);
  });
}

async function fetchLogs(projectId, opts) {
  const lines = parseInt(opts.lines, 10) || 50;

  if (opts.follow) {
    ui.info(`Streaming logs for ${ui.c.bold}${projectId}${ui.c.reset} (Ctrl+C to stop)`);
    ui.divider();
    let seen = new Set();
    const poll = async () => {
      try {
        const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${lines}`);
        const entries = Array.isArray(data) ? data : (data.logs || data.lines || data.deployments || []);
        const fresh = entries.filter(e => {
          const key = (e.timestamp||e.startedAt||'') + (e.message||e.status||'');
          if (seen.has(key)) return false;
          seen.add(key);
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
    const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${lines}`);
    spin.stop();
    const entries = Array.isArray(data) ? data : (data.logs || data.lines || data.deployments || []);
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
