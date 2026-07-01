'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function list() {
  const spin = ui.spinner('Fetching domains');
  try {
    const data = await api.get('/api/domains/mine');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.domains || []);
    if (!items.length) { ui.info('No custom domains configured.'); return; }
    ui.header(`Custom Domains (${items.length})`);
    ui.divider();
    items.forEach(d => {
      const status = d.verified ? `${ui.c.green}✓ verified${ui.c.reset}` : `${ui.c.yellow}⚠ unverified${ui.c.reset}`;
      console.log(`  ${ui.c.bold}${d.domain}${ui.c.reset}  ${status}`);
      if (d.projectId || d.subdomain) console.log(`     ${ui.c.dim}→ project: ${d.projectId || d.subdomain}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function attach(domain, projectId) {
  const spin = ui.spinner(`Attaching ${domain} to ${projectId}`);
  try {
    await api.post('/api/domains/attach', { domain, projectId });
    spin.stop(`Domain ${ui.c.bold}${domain}${ui.c.reset} attached to ${projectId}`);
    ui.info('DNS propagation may take a few minutes.');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function verify(domain) {
  const spin = ui.spinner(`Verifying ${domain}`);
  try {
    const data = await api.post(`/api/domains/${encodeURIComponent(domain)}/verify`, {});
    spin.stop();
    if (data.verified) {
      ui.success(`${domain} is verified!`);
    } else {
      ui.warn(`Verification pending. ${data.message || 'Check your DNS records.'}`);
    }
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function remove(domain) {
  const spin = ui.spinner(`Removing ${domain}`);
  try {
    await api.delete(`/api/domains/${encodeURIComponent(domain)}`);
    spin.stop(`Domain ${ui.c.bold}${domain}${ui.c.reset} removed.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function check(domain) {
  const spin = ui.spinner(`Checking availability of ${domain}`);
  try {
    const data = await api.get(`/api/domains/check?domain=${encodeURIComponent(domain)}`);
    spin.stop();
    if (data.available) {
      ui.success(`${ui.c.bold}${domain}${ui.c.reset} is ${ui.c.green}available${ui.c.reset}!`);
      if (data.price) ui.label('Price', data.price);
    } else {
      ui.warn(`${domain} is ${ui.c.red}not available${ui.c.reset}.`);
    }
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function transfer(domain, projectId) {
  const apiKey  = require('../lib/config').getApiKey();
  const baseUrl = require('../lib/config').getBaseUrl();
  const https   = require('https');
  const http    = require('http');
  const { URL } = require('url');

  if (!apiKey) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  ui.header(`Domain Transfer — ${domain} → ${projectId}`);
  ui.divider();

  const url = new URL(`${baseUrl}/api/domains/transfer?domain=${encodeURIComponent(domain)}&subdomain=${encodeURIComponent(projectId)}`);
  const mod = url.protocol === 'https:' ? https : http;

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
    if (res.statusCode >= 400) {
      ui.error(`Transfer failed (HTTP ${res.statusCode}).`);
      process.exit(1);
    }

    let buf = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      buf += chunk;
      const events = buf.split('\n\n');
      buf = events.pop();
      for (const block of events) {
        if (!block.trim()) continue;
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const ev = JSON.parse(dataStr);
          const elapsed = ev.elapsed ? ` ${ui.c.gray}[${ev.elapsed}s]${ui.c.reset}` : '';
          if (ev.type === 'log')   console.log(`  ${ui.c.cyan}→${ui.c.reset} ${ev.message}${elapsed}`);
          if (ev.type === 'warn')  ui.warn(ev.message);
          if (ev.type === 'done')  { ui.success(ev.message); if (ev.url) ui.label('Live URL', `${ui.c.cyan}${ev.url}${ui.c.reset}`); }
          if (ev.type === 'error') ui.error(ev.message);
        } catch (_) {}
      }
    });
    res.on('end', () => console.log());
  });

  req.on('error', err => { ui.error(`Connection error: ${err.message}`); process.exit(1); });
  req.end();
  process.on('SIGINT', () => { req.destroy(); process.exit(0); });
}

// ── DNS records ───────────────────────────────────────────────────────────────
async function dnsRecords(domain) {
  const spin = ui.spinner(`Fetching DNS records for ${domain}`);
  try {
    const data    = await api.get(`/api/domains/dns?domain=${encodeURIComponent(domain)}`);
    spin.stop();
    const records = Array.isArray(data.records) ? data.records : [];
    if (!records.length) { ui.info('No DNS records found.'); return; }
    ui.header(`DNS Records — ${domain}`);
    ui.divider();
    records.forEach(r => {
      console.log(`  ${ui.c.bold}${String(r.type).padEnd(6)}${ui.c.reset} ${ui.c.green}${String(r.host).padEnd(20)}${ui.c.reset} ${ui.c.dim}→${ui.c.reset} ${r.value}  ${ui.c.gray}ttl:${r.ttl}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Add DNS record ────────────────────────────────────────────────────────────
async function dnsAdd(domain, opts) {
  const readline = require('readline');
  async function ask(q, def = '') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(r => rl.question(`${q}${def ? ` [${def}]` : ''}: `, a => { rl.close(); r(a.trim() || def); }));
  }

  const type  = opts.type  || await ask(`${ui.c.bold}Record type${ui.c.reset} (A/CNAME/MX/TXT)`, 'CNAME');
  const host  = opts.host  || await ask(`${ui.c.bold}Host${ui.c.reset}`, '@');
  const value = opts.value || await ask(`${ui.c.bold}Value${ui.c.reset}`, '');
  const ttl   = opts.ttl   || '3600';

  const spin  = ui.spinner(`Adding ${type} record`);
  try {
    await api.post('/api/domains/dns/add', { domain, type, host, value, ttl: Number(ttl) });
    spin.stop(`DNS record added to ${ui.c.bold}${domain}${ui.c.reset}`);
    ui.label('Type',  type);
    ui.label('Host',  host);
    ui.label('Value', value);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Export external URL ───────────────────────────────────────────────────────
async function exportUrl(domain) {
  const spin = ui.spinner(`Fetching info for ${domain}`);
  try {
    const data = await api.get(`/api/domains/mine`);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.domains || []);
    const entry = items.find(d => d.domain === domain);
    if (!entry) { ui.error(`Domain "${domain}" not found in your account.`); process.exit(1); }

    ui.header(`Export — ${domain}`);
    ui.divider();
    ui.label('Domain',     domain);
    ui.label('Project',    entry.projectId || entry.subdomain || '—');
    ui.label('Verified',   entry.verified ? `${ui.c.green}yes${ui.c.reset}` : `${ui.c.yellow}no${ui.c.reset}`);
    ui.label('External URL', `${ui.c.cyan}https://${domain}${ui.c.reset}`);
    if (entry.subdomain) ui.label('Joytree URL', `${ui.c.cyan}https://${entry.subdomain}.joytree.site${ui.c.reset}`);

    // Export as env var format for easy copy-paste
    console.log(`\n${ui.c.bold}${ui.c.green}── Export as env vars ──────────────────────────${ui.c.reset}`);
    console.log(`  ${ui.c.dim}NEXT_PUBLIC_SITE_URL=https://${domain}`);
    console.log(`  SITE_URL=https://${domain}`);
    console.log(`  EXTERNAL_URL=https://${domain}${ui.c.reset}`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, attach, verify, remove, check, transfer, dnsRecords, dnsAdd, exportUrl };
