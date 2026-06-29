'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

function printLine(entry) {
  if (typeof entry === 'string') {
    console.log(`  ${entry}`);
    return;
  }
  const ts  = entry.timestamp || entry.time || entry.createdAt || '';
  const msg = entry.message   || entry.text || entry.log || entry.line
           || entry.output    || entry.data || JSON.stringify(entry);
  const lvl = String(entry.level || entry.type || '').toLowerCase();
  const time = ts ? `${ui.c.dim}[${new Date(ts).toLocaleTimeString()}]${ui.c.reset} ` : '';
  const colored = lvl === 'error' || lvl === 'stderr' ? `${ui.c.red}${msg}${ui.c.reset}`
                : lvl === 'warn'                      ? `${ui.c.yellow}${msg}${ui.c.reset}`
                : msg;
  console.log(`  ${time}${colored}`);
}

function normalizeEntries(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.logs))        return data.logs;
  if (data && Array.isArray(data.lines))       return data.lines;
  if (data && Array.isArray(data.deployments)) return data.deployments;
  if (data && Array.isArray(data.entries))     return data.entries;
  if (data && typeof data === 'object') {
    // Sometimes logs come back as { "0": "line1", "1": "line2" }
    const vals = Object.values(data);
    if (vals.length) return vals;
  }
  return [];
}

async function fetchLogs(projectId, opts) {
  const lines = parseInt(opts.lines, 10) || 50;

  if (opts.follow) {
    ui.info(`Streaming logs for ${ui.c.bold}${projectId}${ui.c.reset} (Ctrl+C to stop)`);
    ui.divider();
    let seen = new Set();

    const poll = async () => {
      try {
        const data    = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${lines}`);
        const entries = normalizeEntries(data);
        const fresh   = entries.filter(e => {
          const key = typeof e === 'string' ? e
            : (e.timestamp || e.time || '') + (e.message || e.text || e.log || JSON.stringify(e));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        fresh.forEach(printLine);
      } catch (err) {
        ui.warn(`Log fetch error: ${err.message}`);
      }
    };

    await poll();
    const iv = setInterval(poll, 3000);
    process.on('SIGINT', () => { clearInterval(iv); console.log(); process.exit(0); });
    await new Promise(() => {});
    return;
  }

  const spin = ui.spinner(`Fetching logs for ${projectId}`);
  try {
    const data    = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/logs?limit=${lines}`);
    spin.stop();
    const entries = normalizeEntries(data);
    if (!entries.length) { ui.info('No log entries found.'); return; }
    ui.header(`Logs — ${projectId} (last ${entries.length})`);
    ui.divider();
    entries.forEach(printLine);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { fetchLogs };
