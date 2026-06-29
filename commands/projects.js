'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const ui       = require('../lib/ui');

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

async function list(opts) {
  const spin = ui.spinner('Fetching projects');
  try {
    const data = await api.get('/api/v1/projects');
    spin.stop();
    const projects = Array.isArray(data) ? data : (data.projects || []);
    if (!projects.length) { ui.info('No projects yet. Deploy one: joytree deploy'); return; }
    if (opts && opts.json) { console.log(JSON.stringify(projects, null, 2)); return; }
    ui.header(`Projects (${projects.length})`);
    ui.divider();
    projects.forEach(p => {
      const sub = p.subdomain || p.name || p.id;
      console.log(`  ${ui.c.bold}${sub}${ui.c.reset}  ${ui.c.dim}→  https://${sub}.joytree.site${ui.c.reset}`);
      if (p.repoUrl) console.log(`     ${ui.c.dim}repo: ${p.repoUrl}  branch: ${p.branch||'main'}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function inspect(projectId) {
  const spin = ui.spinner(`Loading ${projectId}`);
  try {
    const data = await api.get(`/api/v1/projects/${encodeURIComponent(projectId)}`);
    spin.stop();
    const p = data.project || data;
    ui.header(`Project: ${p.name || p.subdomain || projectId}`);
    ui.divider();
    ui.label('ID',           p.id || p._id || projectId);
    ui.label('Subdomain',    p.subdomain || '—');
    ui.label('Live URL',     `https://${p.subdomain||projectId}.joytree.site`);
    ui.label('Repo',         p.repoUrl || '—');
    ui.label('Branch',       p.branch || 'main');
    ui.label('Build Cmd',    p.buildCommand || '—');
    ui.label('Start Cmd',    p.startCommand || '—');
    ui.label('Static',       p.isStatic ? 'yes' : 'no');
    ui.label('Auto-deploy',  p.autoDeploy ? 'enabled' : 'disabled');
    ui.label('Node Version', p.nodeVersion || '20');
    if (p.createdAt) ui.label('Created', new Date(p.createdAt).toLocaleString());
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function deleteProject(projectId, opts) {
  if (!opts.yes) {
    const ans = await prompt(`${ui.c.yellow}Delete project "${projectId}"? Type yes to confirm: ${ui.c.reset}`);
    if (ans.toLowerCase() !== 'yes') { ui.info('Cancelled.'); return; }
  }
  const spin = ui.spinner(`Deleting ${projectId}`);
  try {
    await api.delete(`/api/v1/projects/${encodeURIComponent(projectId)}`);
    spin.stop(`Project ${ui.c.bold}${projectId}${ui.c.reset} deleted.`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { list, inspect, deleteProject };
