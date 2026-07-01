'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

function rl() { return readline.createInterface({ input: process.stdin, output: process.stdout }); }
async function ask(q, def = '') {
  const r = rl();
  const suffix = def ? ` ${ui.c.gray}[${def}]${ui.c.reset}` : '';
  return new Promise(res => r.question(`${q}${suffix}: `, a => { r.close(); res(a.trim() || def); }));
}

// ── List custom domains ───────────────────────────────────────────────────────
async function list() {
  const spin = ui.spinner('Fetching domains');
  try {
    const data  = await api.get('/api/domains/mine');
    spin.stop();
    const items = Array.isArray(data.domains) ? data.domains : [];
    if (!items.length) { ui.info('No custom domains configured.'); return; }
    ui.header(`Custom Domains (${items.length})`);
    ui.divider();
    items.forEach(d => {
      const status = d.verified ? `${ui.c.green}✓ verified${ui.c.reset}` : `${ui.c.yellow}⚠ unverified${ui.c.reset}`;
      console.log(`  ${ui.c.bold}${d.domain}${ui.c.reset}  ${status}`);
      if (d.projectName || d.projectId) console.log(`     ${ui.c.gray}→ project: ${d.projectName || d.projectId}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Attach domain to project ──────────────────────────────────────────────────
async function attach(domain, projectId) {
  const spin = ui.spinner(`Attaching ${domain} to ${projectId}`);
  try {
    const data = await api.post('/api/domains/attach', { domain, projectId });
    spin.stop(`Domain ${ui.c.bold}${domain}${ui.c.reset} attached!`);
    if (data.targetHost) ui.label('Points to', data.targetHost);
    ui.info('DNS changes may take a few minutes to propagate.');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Domain transfer — live SSE stream (exactly like dashboard) ────────────────
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
    if (res.statusCode >= 400) { ui.error(`Transfer failed (HTTP ${res.statusCode}).`); process.exit(1); }
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      buf += chunk;
      const events = buf.split('\n\n');
      buf = events.pop();
      for (const block of events) {
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const ev      = JSON.parse(dataStr);
          const elapsed = ev.elapsed ? ` ${ui.c.gray}[${ev.elapsed}s]${ui.c.reset}` : '';
          if (ev.type === 'log')   console.log(`  ${ui.c.green}→${ui.c.reset} ${ev.message}${elapsed}`);
          if (ev.type === 'warn')  ui.warn(ev.message);
          if (ev.type === 'done') {
            console.log();
            ui.success(ev.message);
            if (ev.url) ui.label('Live URL', `${ui.c.cyan}${ui.c.bold}${ev.url}${ui.c.reset}`);
          }
          if (ev.type === 'error') ui.error(ev.message);
        } catch (_) {}
      }
    });
    res.on('end', () => { console.log(); process.exit(0); });
  });

  req.on('error', err => { ui.error(`Connection error: ${err.message}`); process.exit(1); });
  req.end();
  process.on('SIGINT', () => { req.destroy(); process.exit(0); });
}

// ── Verify DNS ────────────────────────────────────────────────────────────────
async function verify(domain) {
  const spin = ui.spinner(`Verifying ${domain}`);
  try {
    const data = await api.post(`/api/domains/${encodeURIComponent(domain)}/verify`, {});
    spin.stop();
    if (data.verified) ui.success(`${domain} is verified!`);
    else ui.warn(`Verification pending. ${data.message || 'Check your DNS records.'}`);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Remove domain ─────────────────────────────────────────────────────────────
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

// ── Check availability ────────────────────────────────────────────────────────
async function check(domain) {
  const spin = ui.spinner(`Checking ${domain}`);
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
      console.log(`  ${ui.c.bold}${String(r.type).padEnd(6)}${ui.c.reset} ${ui.c.green}${String(r.host).padEnd(20)}${ui.c.reset} ${ui.c.gray}→${ui.c.reset} ${r.value}  ${ui.c.gray}ttl:${r.ttl}${ui.c.reset}`);
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
  const type  = opts.type  || await ask(`${ui.c.bold}Record type${ui.c.reset} (A/CNAME/MX/TXT)`, 'CNAME');
  const host  = opts.host  || await ask(`${ui.c.bold}Host${ui.c.reset}`, '@');
  const value = opts.value || await ask(`${ui.c.bold}Value${ui.c.reset}`, '');
  const ttl   = Number(opts.ttl || 3600);

  const spin = ui.spinner(`Adding ${type} record to ${domain}`);
  try {
    await api.post('/api/domains/dns/add', { domain, type, host, value, ttl });
    spin.stop(`DNS record added to ${ui.c.bold}${domain}${ui.c.reset}`);
    ui.label('Type',  type);
    ui.label('Host',  host);
    ui.label('Value', value);
    ui.label('TTL',   String(ttl));
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Delete DNS record ─────────────────────────────────────────────────────────
async function dnsDelete(domain, opts) {
  let recordId = opts.recordId;
  if (!recordId) {
    // Show records first so user can pick
    const data    = await api.get(`/api/domains/dns?domain=${encodeURIComponent(domain)}`);
    const records = Array.isArray(data.records) ? data.records : [];
    if (!records.length) { ui.info('No DNS records found.'); return; }
    ui.header(`DNS Records — ${domain}`);
    ui.divider();
    records.forEach((r, i) => {
      console.log(`  ${ui.c.cyan}${i + 1}${ui.c.reset}  ${ui.c.bold}${String(r.type).padEnd(6)}${ui.c.reset} ${String(r.host).padEnd(20)} → ${r.value}  ${ui.c.gray}id: ${r.id}${ui.c.reset}`);
    });
    const ans = await ask(`\n${ui.c.bold}Enter record ID to delete${ui.c.reset}`, '');
    recordId = ans || records[0].id;
  }
  const spin = ui.spinner(`Deleting DNS record ${recordId}`);
  try {
    await api.post('/api/domains/dns/delete', { domain, recordId });
    spin.stop(`DNS record ${ui.c.bold}${recordId}${ui.c.reset} deleted from ${domain}`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Update nameservers ────────────────────────────────────────────────────────
async function nameservers(domain, opts) {
  let nsList = opts.ns ? opts.ns.split(',').map(s => s.trim()) : [];
  if (!nsList.length) {
    const ans = await ask(`${ui.c.bold}Nameservers${ui.c.reset} (comma-separated, e.g. ns1.namesilo.com,ns2.namesilo.com)`, '');
    nsList = ans.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!nsList.length) { ui.error('At least one nameserver is required.'); process.exit(1); }
  const spin = ui.spinner(`Updating nameservers for ${domain}`);
  try {
    await api.post('/api/domains/nameservers', { domain, nameservers: nsList });
    spin.stop(`Nameservers updated for ${ui.c.bold}${domain}${ui.c.reset}`);
    nsList.forEach((ns, i) => ui.label(`NS${i + 1}`, ns));
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ── External proxy (point a joytree subdomain to an external URL) ─────────────
async function proxyList() {
  const spin = ui.spinner('Fetching external proxies');
  try {
    const data    = await api.get('/api/domains/proxy-imports');
    spin.stop();
    const proxies = Array.isArray(data.proxies) ? data.proxies : [];
    if (!proxies.length) { ui.info('No external proxies configured.'); return; }
    ui.header(`External URL Proxies (${proxies.length})`);
    ui.divider();
    proxies.forEach(p => {
      console.log(`  ${ui.c.bold}${p.subdomain}.joytree.site${ui.c.reset}  ${ui.c.gray}→${ui.c.reset}  ${ui.c.cyan}${p.externalUrl}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function proxySet(subdomain, opts) {
  let externalUrl = opts.url;
  if (!externalUrl) {
    externalUrl = await ask(`${ui.c.bold}External URL to proxy to${ui.c.reset} (e.g. https://myapp.railway.app)`, '');
    if (!externalUrl) { ui.error('External URL is required.'); process.exit(1); }
  }
  const spin = ui.spinner(`Pointing ${subdomain}.joytree.site → ${externalUrl}`);
  try {
    const data = await api.post('/api/domains/proxy-import', { subdomain, externalUrl });
    spin.stop();
    console.log(`\n${ui.c.green}${ui.c.bold}✓ External proxy set!${ui.c.reset}\n`);
    ui.label('Joytree URL',  `${ui.c.cyan}https://${subdomain}.joytree.site${ui.c.reset}`);
    ui.label('Proxies to',   `${ui.c.cyan}${externalUrl}${ui.c.reset}`);
    ui.info('All traffic to your Joytree subdomain will now be forwarded to the external URL.');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function proxyRemove(subdomain) {
  const spin = ui.spinner(`Removing external proxy for ${subdomain}`);
  try {
    await api.delete(`/api/domains/proxy-import/${encodeURIComponent(subdomain)}`);
    spin.stop(`External proxy for ${ui.c.bold}${subdomain}${ui.c.reset} removed.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  list, attach, transfer, verify, remove, check,
  dnsRecords, dnsAdd, dnsDelete, nameservers,
  proxyList, proxySet, proxyRemove,
};
