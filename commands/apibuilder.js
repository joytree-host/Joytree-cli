'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

// Mirrors the AI Version picker on the dashboard's Realtime API Builder page.
// v1 is the default and free for everyone. v2 needs an active paid plan.
// v3/v4 are currently reserved for the platform admin — the server enforces
// this and returns a 403 with an explanation if you try to use them anyway.
const AI_VERSIONS = [
  { key: 'v1', label: 'Joytree AI v1', desc: 'Fast, reliable single-model generation. Default — free for everyone.' },
  { key: 'v2', label: 'Joytree AI v2', desc: 'Dual-engine with automatic failover. Requires an active paid plan.' },
  { key: 'v3', label: 'Joytree AI v3', desc: 'High-reasoning AI for structured APIs and large batch generation. Currently admin-only.' },
  { key: 'v4', label: 'Joytree AI v4', desc: 'Multi-provider cascade with automatic failover. Currently admin-only.' },
];

// Extensions the dashboard's upload picker accepts for context files.
const MIME_BY_EXT = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv', '.json': 'application/json',
  '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python', '.html': 'text/html',
  '.css': 'text/css', '.xml': 'application/xml', '.yaml': 'text/yaml', '.yml': 'text/yaml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const TEXT_EXTS = new Set(['.txt', '.md', '.csv', '.json', '.js', '.ts', '.py', '.html', '.css', '.xml', '.yaml', '.yml']);

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function ask(question, defaultVal = '') {
  const r = rl();
  const suffix = defaultVal ? ` ${ui.c.dim}[${defaultVal}]${ui.c.reset}` : '';
  return new Promise(resolve => r.question(`${question}${suffix}: `, ans => {
    r.close();
    resolve(ans.trim() || defaultVal);
  }));
}

function readContextFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    ui.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const ext  = path.extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  const name = path.basename(resolved);
  const buf  = fs.readFileSync(resolved);
  if (TEXT_EXTS.has(ext)) {
    return { sourceText: buf.toString('utf8'), fileBase64: '', fileMime: mime, fileName: name };
  }
  // Non-text formats (pdf/doc/docx/ppt/pptx) are sent as base64, same as a
  // browser upload on the dashboard — the server extracts context from them.
  return { sourceText: '', fileBase64: buf.toString('base64'), fileMime: mime, fileName: name };
}

async function providers() {
  ui.header('Joytree AI Versions');
  ui.divider();
  AI_VERSIONS.forEach(v => {
    console.log(`  ${ui.c.bold}${ui.c.green}${v.label}${ui.c.reset}`);
    console.log(`     ${ui.c.dim}${v.desc}${ui.c.reset}`);
  });
  console.log(`\n  ${ui.c.dim}Pass one with: joytree api create --ai-version v1${ui.c.reset}\n`);
}

async function create(opts) {
  let { prompt, file, aiVersion } = opts;
  aiVersion = String(aiVersion || 'v1').toLowerCase();
  if (!AI_VERSIONS.some(v => v.key === aiVersion)) {
    ui.error(`Unknown --ai-version "${aiVersion}". Use one of: ${AI_VERSIONS.map(v => v.key).join(', ')}`);
    process.exit(1);
  }

  if (!prompt) {
    prompt = await ask(`${ui.c.bold}Describe the API you want${ui.c.reset} ${ui.c.dim}(e.g. "A todo list API: create, list, complete, delete")${ui.c.reset}`, '');
  }

  let fileCtx = { sourceText: '', fileBase64: '', fileMime: '', fileName: '' };
  if (file) fileCtx = readContextFile(file);

  if (!prompt && !fileCtx.sourceText && !fileCtx.fileBase64) {
    ui.error('A --prompt or a --file with content is required.');
    process.exit(1);
  }

  const spin = ui.spinner('Sending request to Joytree AI — large requests may take a few minutes');
  let data;
  try {
    data = await api.post('/api/developer/flows/from-text', {
      prompt: prompt || '',
      sourceText: fileCtx.sourceText,
      fileBase64: fileCtx.fileBase64,
      fileMime: fileCtx.fileMime,
      fileName: fileCtx.fileName,
      aiVersion,
    });
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
  spin.stop('API deployed!');

  console.log(`\n${ui.c.green}${ui.c.bold}✓ Flow ${data.flowId}${ui.c.reset}`);
  ui.label('Endpoint', `${ui.c.cyan}${data.endpoint || '—'}${ui.c.reset}`);
  if (data.chunked && data.totalGenerated) ui.label('Generated', `${data.totalGenerated} items (chunked)`);
  console.log(`\n  ${ui.c.dim}Dockerize it:   ${ui.c.cyan}joytree api dockerize ${data.flowId}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Link a project: ${ui.c.cyan}joytree api link ${data.flowId} --project-id <id>${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Refine it:      ${ui.c.cyan}joytree api followup ${data.flowId} -m "..."${ui.c.reset}\n`);
}

async function list() {
  const spin = ui.spinner('Fetching your generated APIs');
  try {
    const data = await api.get('/api/developer/apis');
    spin.stop();
    const apis = Array.isArray(data.apis) ? data.apis : [];
    if (!apis.length) { ui.info('No APIs created yet. Create one: joytree api create'); return; }
    ui.header(`Generated APIs (${apis.length})`);
    ui.divider();
    apis.forEach(a => {
      const badge = a.dockerized ? `${ui.c.green}● dockerized${ui.c.reset}` : `${ui.c.yellow}● flow only${ui.c.reset}`;
      const prompt = String(a.prompt || 'No prompt').slice(0, 80);
      console.log(`  ${badge}  ${ui.c.bold}${a.flowId}${ui.c.reset}`);
      console.log(`     ${ui.c.dim}${prompt}${prompt.length >= 80 ? '…' : ''}${ui.c.reset}`);
      if (a.endpoint) console.log(`     ${ui.c.cyan}${a.endpoint}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function inspect(flowId) {
  const spin = ui.spinner('Fetching API details');
  try {
    const data = await api.get(`/api/developer/apis/${encodeURIComponent(flowId)}`);
    spin.stop();
    const a = data.api || {};
    ui.header(`API — ${flowId}`);
    ui.divider();
    ui.label('Prompt', a.prompt || '—');
    ui.label('Endpoint', a.endpoint || `/api/live/${flowId}`);
    ui.label('Dockerized', a.dockerized ? 'yes' : 'no');
    ui.label('Linked project', a.linkedProjectId || '—');
    ui.label('Created', a.createdAt || '—');
    ui.label('Updated', a.updatedAt || '—');
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function followup(flowId, opts) {
  let message = opts.message;
  if (!message) {
    message = await ask('Follow-up instructions', '');
    if (!message) { ui.error('A message is required.'); process.exit(1); }
  }
  const spin = ui.spinner('Sending follow-up to refine the API');
  try {
    await api.post(`/api/developer/apis/${encodeURIComponent(flowId)}/followup`, { followup: message });
    spin.stop('Follow-up applied!');
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function dockerize(flowId) {
  const spin = ui.spinner('Dockerizing — building image and starting container');
  try {
    const data = await api.post(`/api/developer/flows/${encodeURIComponent(flowId)}/dockerize`, {});
    spin.stop('Dockerized!');
    ui.label('Live URL', `${ui.c.cyan}${data.liveUrl || '—'}${ui.c.reset}`);
    console.log(`\n  ${ui.c.dim}This is now a real, persistent container — it behaves like any other Joytree project.${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function link(flowId, opts) {
  const projectId = opts.projectId;
  if (!projectId) { ui.error('--project-id is required.'); process.exit(1); }
  const spin = ui.spinner(`Linking ${flowId} to project ${projectId}`);
  try {
    const data = await api.post(`/api/developer/apis/${encodeURIComponent(flowId)}/link-project`, { projectId });
    spin.stop('Linked!');
    ui.label('Endpoint', data.endpoint || '—');
    ui.label('API key', data.apiKey || '—');
    console.log(`\n  ${ui.c.dim}${projectId} now has API_ENDPOINT and API_KEY set as env vars.${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function del(flowId, opts) {
  if (!opts.yes) {
    const ans = await ask(`${ui.c.yellow}Delete API "${flowId}"? Type yes to confirm${ui.c.reset}`, '');
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner(`Deleting ${flowId}`);
  try {
    await api.delete(`/api/developer/apis/${encodeURIComponent(flowId)}`);
    spin.stop(`API ${ui.c.bold}${flowId}${ui.c.reset} deleted.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { providers, create, list, inspect, followup, dockerize, link, del };
