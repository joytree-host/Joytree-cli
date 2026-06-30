'use strict';

const https   = require('https');
const http    = require('http');
const { URL } = require('url');
const config  = require('../lib/config');
const ui      = require('../lib/ui');

function printLine(text, level) {
  const lvl = String(level || '').toLowerCase();
  const colored = lvl === 'error' || lvl === 'stderr' ? `${ui.c.red}${text}${ui.c.reset}`
                : lvl === 'warn'                      ? `${ui.c.yellow}${text}${ui.c.reset}`
                : text;
  console.log(`  ${colored}`);
}

// Runtime logs are streamed via Server-Sent Events (SSE), not plain JSON.
// This connects directly and prints each event as it arrives.
function streamRuntimeLogs(projectId, opts) {
  const apiKey  = config.getApiKey();
  const baseUrl = config.getBaseUrl();
  if (!apiKey) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  const url = new URL(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/runtime-logs`);
  const mod = url.protocol === 'https:' ? https : http;

  ui.info(`Streaming logs for ${ui.c.bold}${projectId}${ui.c.reset} ${ui.c.dim}(Ctrl+C to stop)${ui.c.reset}`);
  ui.divider();

  const req = mod.request({
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname + url.search,
    method:   'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept':        'text/event-stream',
      'User-Agent':    `joytree-cli/${require('../package.json').version}`,
    },
  }, (res) => {
    if (res.statusCode === 404) {
      ui.error(`Project "${projectId}" not found.`);
      process.exit(1);
    }
    if (res.statusCode >= 400) {
      ui.error(`Failed to connect to log stream (HTTP ${res.statusCode}).`);
      process.exit(1);
    }

    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      buffer += chunk;
      const events = buffer.split('\n\n');
      buffer = events.pop(); // keep incomplete event in buffer

      for (const block of events) {
        if (!block.trim()) continue;
        const lines = block.split('\n');
        let eventType = 'message';
        let dataStr   = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:'))  dataStr   += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const parsed = JSON.parse(dataStr);
          if (eventType === 'log' || eventType === 'message') {
            const text = parsed.message || parsed.text || parsed.line || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
            printLine(text, parsed.level);
          } else if (eventType === 'error') {
            ui.error(parsed.message || parsed.error || 'Stream error');
          }
          // ignore keepalive/ping events silently
        } catch (_) {
          if (dataStr && dataStr !== 'ping') printLine(dataStr);
        }
      }
    });

    res.on('end', () => {
      ui.info('Log stream ended.');
      process.exit(0);
    });
  });

  req.on('error', (err) => {
    ui.error(`Connection error: ${err.message}`);
    process.exit(1);
  });

  req.end();

  process.on('SIGINT', () => {
    req.destroy();
    console.log();
    process.exit(0);
  });
}

async function fetchLogs(projectId, opts) {
  // Runtime logs are always a live SSE stream on this platform.
  // --follow just keeps it open; without it we still connect but exit after first burst.
  streamRuntimeLogs(projectId, opts);

  if (!opts.follow) {
    // Auto-close after a short grace period if not following
    setTimeout(() => process.exit(0), 5000);
  }
}

module.exports = { fetchLogs };
