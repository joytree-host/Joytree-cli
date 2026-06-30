'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');

// ── Framework presets (mirrors the dashboard exactly) ─────────────────────────
const FRAMEWORKS = [
  { key: 'auto',       label: 'Auto-detect',  install: '',                                        build: '',                    start: '',                                  output: '',      siteType: 'static'  },
  { key: 'static',     label: 'Static HTML',  install: '',                                        build: 'echo skip',           start: '',                                  output: '.',     siteType: 'static'  },
  { key: 'vite',       label: 'Vite',         install: 'npm install',                             build: 'npm run build',       start: '',                                  output: 'dist',  siteType: 'static'  },
  { key: 'react-cra',  label: 'React (CRA)',  install: 'npm install',                             build: 'npm run build',       start: '',                                  output: 'build', siteType: 'static'  },
  { key: 'nextjs',     label: 'Next.js',      install: 'npm install',                             build: 'npm run build',       start: 'npm start',                         output: '.next', siteType: 'server'  },
  { key: 'nuxt',       label: 'Nuxt',         install: 'npm install',                             build: 'npm run build',       start: 'npm run start',                     output: '.output',siteType: 'server' },
  { key: 'node',       label: 'Node.js',      install: 'npm install',                             build: 'npm run build',       start: 'npm start',                         output: '.',     siteType: 'server'  },
  { key: 'node-nestjs',label: 'NestJS',       install: 'npm install',                             build: 'npm run build',       start: 'node dist/main.js',                 output: '.',     siteType: 'server'  },
  { key: 'bun',        label: 'Bun',          install: 'bun install',                             build: 'bun run build',       start: 'bun run start',                     output: '.',     siteType: 'server'  },
  { key: 'deno',       label: 'Deno',         install: 'echo skip',                               build: 'echo skip',           start: 'deno task start',                   output: '.',     siteType: 'server'  },
  { key: 'python',     label: 'Python',       install: 'pip install -r requirements.txt',         build: 'echo skip',           start: 'python app.py',                     output: '.',     siteType: 'server'  },
  { key: 'go',         label: 'Go',           install: 'go mod download',                         build: 'go build -o app .',   start: './app',                             output: '.',     siteType: 'server'  },
  { key: 'rust',       label: 'Rust',         install: 'cargo fetch',                             build: 'cargo build --release',start: './target/release/app',             output: '.',     siteType: 'server'  },
  { key: 'java',       label: 'Java',         install: './mvnw -q -DskipTests dependency:resolve',build: './mvnw -q -DskipTests package', start: 'java -jar target/*.jar',   output: '.',     siteType: 'server'  },
  { key: 'dotnet',     label: '.NET',         install: 'dotnet restore',                          build: 'dotnet publish -c Release', start: 'dotnet run --no-build',        output: '.',     siteType: 'server'  },
  { key: 'php',        label: 'PHP',          install: 'composer install --no-dev',               build: 'echo skip',           start: 'php -S 0.0.0.0:${PORT:-3000} -t public', output: 'public', siteType: 'server' },
];

const NODE_VERSIONS = ['18', '20', '22'];

// ── Prompt helpers ────────────────────────────────────────────────────────────
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

async function choose(question, options) {
  const c = ui.c;
  console.log(`\n${c.bold}${question}${c.reset}`);
  options.forEach((o, i) => {
    console.log(`  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}  ${o.label || o}`);
  });
  const r = rl();
  return new Promise(resolve => {
    r.question(`\n${c.bold}Choice${c.reset} ${c.dim}[1-${options.length}]${c.reset}: `, ans => {
      r.close();
      const idx = parseInt(ans.trim(), 10) - 1;
      resolve(options[idx] || options[0]);
    });
  });
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const r    = rl();
  return new Promise(resolve => {
    r.question(`${question} ${ui.c.dim}[${hint}]${ui.c.reset}: `, ans => {
      r.close();
      const a = ans.trim().toLowerCase();
      resolve(a === '' ? defaultYes : a === 'y' || a === 'yes');
    });
  });
}

// ── Build settings wizard ─────────────────────────────────────────────────────
async function buildSettingsWizard(defaults = {}) {
  const c = ui.c;

  // Step 1: Framework
  const fw = await choose('Select your framework (or Auto-detect):', FRAMEWORKS);

  let install = fw.install;
  let build   = fw.build;
  let start   = fw.start;
  let output  = fw.output;
  let siteType = fw.siteType;
  let nodeVer = '20';

  // Step 2: Customise or accept defaults
  const customise = fw.key !== 'auto'
    ? await confirm(`\nUse default settings for ${c.bold}${fw.label}${c.reset}?`, true)
    : false;

  if (!customise || fw.key === 'auto') {
    console.log(`\n${c.bold}Build Settings${c.reset} ${c.dim}(press Enter to keep default)${c.reset}`);

    install  = await ask(`  Install command `, install  || 'npm install');
    build    = await ask(`  Build command   `, build    || 'npm run build');
    start    = await ask(`  Start command   `, start    || '');
    output   = await ask(`  Output dir      `, output   || 'dist');

    // Site type
    const typeChoice = await choose('Site type:', [
      { label: 'Static   — HTML/CSS/JS output (no server process)',  val: 'static' },
      { label: 'Server   — runs a persistent server process (Node, Python, Go…)', val: 'server' },
    ]);
    siteType = typeChoice.val || siteType;

    // Node version (only relevant for Node/static)
    if (fw.key === 'auto' || fw.key.startsWith('node') || fw.key === 'nextjs' || fw.key === 'nuxt' || fw.key === 'vite' || fw.key === 'react-cra' || fw.key === 'bun') {
      const nvChoice = await choose('Node.js version:', NODE_VERSIONS.map(v => ({ label: `Node ${v}`, val: v })));
      nodeVer = nvChoice.val || '20';
    }
  }

  return { install, build, start, output, siteType, nodeVer, framework: fw.key };
}

// ── Poll build status ─────────────────────────────────────────────────────────
async function pollStatus(projectId, timeoutMs = 300000) {
  const start  = Date.now();
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let   i      = 0;
  const isTTY  = process.stdout.isTTY;

  const iv = setInterval(() => {
    if (!isTTY) return;
    process.stdout.write(`\r${ui.c.cyan}${frames[i++ % frames.length]}${ui.c.reset} Building... ${ui.c.dim}(Ctrl+C to detach)${ui.c.reset}`);
  }, 100);

  try {
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const data    = await api.get(`/api/deployments?projectId=${encodeURIComponent(projectId)}`);
        const deploys = Array.isArray(data) ? data : (data.deployments || []);
        const latest  = deploys[0];
        if (latest) {
          const status = String(latest.status || '').toLowerCase();
          if (status === 'success') {
            clearInterval(iv);
            if (isTTY) process.stdout.write('\r\x1b[K');
            console.log(`\n${ui.c.green}${ui.c.bold}🎉 🎉 🎉  Congratulations! Your site is live!  🎉 🎉 🎉${ui.c.reset}\n`);
            ui.label('Live URL', `${ui.c.cyan}${ui.c.bold}https://${projectId}.joytree.site${ui.c.reset}`);
            console.log();
            return 'success';
          }
          if (status === 'failed' || status === 'error') {
            clearInterval(iv);
            if (isTTY) process.stdout.write('\r\x1b[K');
            const reason = latest.error || latest.failReason || latest.message || 'Unknown error';
            ui.error(`Build ${ui.c.red}failed${ui.c.reset}: ${reason}`);
            ui.info(`View full logs: ${ui.c.cyan}joytree logs ${projectId}${ui.c.reset}`);
            return 'failed';
          }
        }
      } catch (_) {}
    }
    clearInterval(iv);
    if (isTTY) process.stdout.write('\r\x1b[K');
    ui.info(`Still building. Check status: ${ui.c.cyan}joytree deployments ${projectId}${ui.c.reset}`);
    return 'timeout';
  } catch (err) {
    clearInterval(iv);
    if (isTTY) process.stdout.write('\r\x1b[K');
    return 'unknown';
  }
}

// ── Deploy ────────────────────────────────────────────────────────────────────
async function deployGit(opts) {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  let { repo, branch, name, build, start, static: isStatic } = opts;

  // Repo
  if (!repo) {
    repo = await ask(`${ui.c.bold}GitHub repo URL${ui.c.reset}`);
    if (!repo) { ui.error('Repository URL is required.'); process.exit(1); }
  }

  // Name
  if (!name) {
    const guessed = repo.split('/').pop().replace(/\.git$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    name = await ask(`${ui.c.bold}Project name/subdomain${ui.c.reset}`, guessed);
  }

  // Branch
  if (!branch) {
    branch = await ask(`${ui.c.bold}Branch${ui.c.reset}`, 'main');
  }

  // Build settings — skip if flags were passed, otherwise run wizard
  let settings;
  const hasFlags = build || start || isStatic;
  if (hasFlags) {
    settings = {
      install:  '',
      build:    build  || '',
      start:    start  || '',
      output:   'dist',
      siteType: isStatic ? 'static' : (start ? 'server' : 'static'),
      nodeVer:  '20',
      framework:'auto',
    };
  } else {
    console.log(`\n${ui.c.bold}${ui.c.cyan}Build Configuration${ui.c.reset}`);
    ui.divider();
    settings = await buildSettingsWizard();
  }

  // Summary
  console.log(`\n${ui.c.bold}Deployment Summary${ui.c.reset}`);
  ui.divider();
  ui.label('Project',   name);
  ui.label('Repo',      repo);
  ui.label('Branch',    branch);
  ui.label('Framework', settings.framework);
  ui.label('Site type', settings.siteType);
  if (settings.install) ui.label('Install',   settings.install);
  if (settings.build)   ui.label('Build',     settings.build);
  if (settings.start)   ui.label('Start',     settings.start);
  if (settings.output)  ui.label('Output dir',settings.output);
  ui.label('Node ver',  settings.nodeVer);
  ui.label('URL',       `https://${name}.joytree.site`);
  console.log();

  const go = await confirm(`${ui.c.bold}Deploy now?${ui.c.reset}`, true);
  if (!go) { ui.info('Cancelled.'); return; }

  const spin = ui.spinner(`Triggering deploy for ${ui.c.bold}${name}${ui.c.reset}`);
  try {
    const data = await api.post('/api/deploy', {
      name,
      subdomain:  name,
      repoUrl:    repo,
      branch,
      installCmd: settings.install,
      buildCmd:   settings.build,
      startCmd:   settings.start,
      outputDir:  settings.output,
      siteType:   settings.siteType,
      nodeVer:    settings.nodeVer,
      workingDir: '',
      source:     'cli',
    });

    spin.stop();
    ui.label('Deploy ID', data.deployId || '—');
    console.log();
    await pollStatus(name);
    console.log(`${ui.c.dim}View logs: ${ui.c.cyan}joytree logs ${name} --follow${ui.c.reset}\n`);

  } catch (err) {
    spin.stop();
    ui.error(`Deploy failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Redeploy ──────────────────────────────────────────────────────────────────
async function redeploy(projectId) {
  const spin = ui.spinner(`Fetching project details`);
  try {
    const ws   = await api.get('/api/v1/transfer');
    const proj = (ws.projects || []).find(p =>
      p.subdomain === projectId || p.id === projectId || p.name === projectId
    );
    if (!proj) { spin.stop(); ui.error(`Project "${projectId}" not found.`); process.exit(1); }
    spin.stop();

    const spin2 = ui.spinner(`Redeploying ${ui.c.bold}${projectId}${ui.c.reset}`);
    const data  = await api.post('/api/deploy', {
      name:       proj.name       || proj.subdomain,
      subdomain:  proj.subdomain  || proj.name,
      repoUrl:    proj.repoUrl,
      branch:     proj.branch     || 'main',
      buildCmd:   proj.buildCommand || proj.buildCmd || '',
      startCmd:   proj.startCommand || proj.startCmd || '',
      installCmd: proj.installCmd   || '',
      outputDir:  proj.outputDir    || 'dist',
      siteType:   proj.siteType     || (proj.isStatic ? 'static' : 'server'),
      nodeVer:    proj.nodeVersion  || '20',
      source:     'cli',
    });
    spin2.stop();
    ui.label('Deploy ID', data.deployId || '—');
    console.log();
    await pollStatus(projectId);
    console.log();
  } catch (err) {
    ui.error(`Redeploy failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Open ──────────────────────────────────────────────────────────────────────
async function open(projectId) {
  if (!projectId) { ui.error('Provide a project ID. Example: joytree open my-site'); process.exit(1); }
  const url = `https://${projectId}.joytree.site`;
  ui.info(`Opening ${url}`);
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

// ── Deployments list ──────────────────────────────────────────────────────────
async function listDeployments(projectId, opts) {
  const limit = parseInt(opts.limit, 10) || 10;
  const spin  = ui.spinner('Fetching deployments');
  try {
    const query = projectId
      ? `/api/deployments?projectId=${encodeURIComponent(projectId)}`
      : `/api/deployments?mine=1`;
    const data  = await api.get(query);
    spin.stop();
    const items = Array.isArray(data) ? data : (data.deployments || data.items || []);
    if (!items.length) { ui.info('No deployments found.'); return; }
    ui.header(`Recent Deployments${projectId ? ' — ' + projectId : ''}`);
    ui.divider();
    items.slice(0, limit).forEach(d => {
      const ts = d.startedAt || d.createdAt ? new Date(d.startedAt || d.createdAt).toLocaleString() : '—';
      console.log(`  ${ui.statusBadge(d.status)}  ${ui.c.bold}${d.projectName || d.subdomain || d.projectId || '—'}${ui.c.reset}  ${ui.c.dim}${ts}${ui.c.reset}`);
      if (d.branch) console.log(`     ${ui.c.dim}branch: ${d.branch}${d.duration ? `  ${d.duration}s` : ''}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { deployGit, redeploy, open, listDeployments };
