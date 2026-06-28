'use strict';

const { api } = require('../lib/api');
const ui      = require('../lib/ui');

async function repos(opts) {
  const spin = ui.spinner('Fetching your GitHub repositories');
  try {
    const data = await api.get('/api/github/repos');
    spin.stop();
    const items = Array.isArray(data) ? data : (data.repos || data.repositories || []);
    if (!items.length) {
      ui.warn('No GitHub repos found. Make sure your GitHub account is linked on the dashboard.');
      return;
    }
    ui.header(`GitHub Repositories (${items.length})`);
    ui.divider();
    items.forEach(r => {
      const visibility = r.private ? `${ui.c.dim}private${ui.c.reset}` : `${ui.c.green}public${ui.c.reset}`;
      console.log(`  ${ui.c.bold}${r.full_name || r.name}${ui.c.reset}  [${visibility}]`);
      if (r.description) console.log(`     ${ui.c.dim}${r.description}${ui.c.reset}`);
      if (r.default_branch) console.log(`     ${ui.c.dim}default branch: ${r.default_branch}${ui.c.reset}`);
    });
    console.log(`\n  ${ui.c.dim}Run: joytree deploy --repo <url> to deploy any repo above.${ui.c.reset}\n`);
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function branches(repoUrl) {
  if (!repoUrl) { ui.error('Provide a repo URL. Example: joytree pull branches https://github.com/you/repo'); process.exit(1); }
  const spin = ui.spinner(`Fetching branches for ${repoUrl}`);
  try {
    const data = await api.get(`/api/github/branches?repoUrl=${encodeURIComponent(repoUrl)}`);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.branches || []);
    if (!items.length) { ui.info('No branches found.'); return; }
    ui.header(`Branches — ${repoUrl}`);
    ui.divider();
    items.forEach(b => {
      const name = b.name || b;
      const isDefault = b.default ? ` ${ui.c.green}(default)${ui.c.reset}` : '';
      console.log(`  ${ui.c.bold}${name}${ui.c.reset}${isDefault}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { repos, branches };
