'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function providers() {
  const spin = ui.spinner('Fetching available AI providers');
  try {
    const data = await api.get('/api/ai/agent/providers');
    spin.stop();
    ui.header('AI Agent Providers');
    ui.divider();
    (data.providers || []).forEach(p => {
      const tag = p.available ? `${ui.c.green}available${ui.c.reset}` : `${ui.c.gray}needs key${ui.c.reset}`;
      const best = p.best ? ` ${ui.c.yellow}★ recommended${ui.c.reset}` : '';
      console.log(`  ${ui.c.bold}${p.label}${ui.c.reset}  [${tag}]${best}`);
      console.log(`     ${ui.c.dim}${p.description}${ui.c.reset}`);
    });
    console.log(`\n  ${ui.c.dim}Recommended: ${data.recommended || '—'}${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function start(opts) {
  let { prompt: taskPrompt, provider, projectId } = opts;
  if (!taskPrompt) {
    taskPrompt = await prompt(`${ui.c.bold}Describe what you want the AI agent to fix/build:${ui.c.reset} `);
    if (!taskPrompt) { ui.error('A task prompt is required.'); process.exit(1); }
  }
  const spin = ui.spinner('Starting AI agent session');
  try {
    const data = await api.post('/api/ai/agent/start', { prompt: taskPrompt, provider: provider || undefined, projectId: projectId || undefined });
    spin.stop('AI agent session started!');
    ui.label('Session ID', data.sessionId || '—');
    console.log(`\n  ${ui.c.dim}Watch progress: ${ui.c.cyan}joytree agent status ${data.sessionId}${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function status(sessionId) {
  const spin = ui.spinner('Checking agent status');
  try {
    const data = await api.get(`/api/ai/agent/status/${encodeURIComponent(sessionId)}`);
    spin.stop();
    ui.header('Agent Session');
    ui.divider();
    ui.label('Status', data.status || '—');
    if (data.summary) ui.label('Summary', data.summary);
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function followup(sessionId, opts) {
  let message = opts.message;
  if (!message) {
    message = await prompt(`${ui.c.bold}Follow-up message:${ui.c.reset} `);
    if (!message) { ui.error('A message is required.'); process.exit(1); }
  }
  const spin = ui.spinner('Sending follow-up');
  try {
    await api.post(`/api/ai/agent/followup/${encodeURIComponent(sessionId)}`, { message });
    spin.stop('Follow-up sent!');
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { providers, start, status, followup };
