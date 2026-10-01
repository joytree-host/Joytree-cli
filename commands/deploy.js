'use strict';

const readline = require('readline');
const { api }  = require('../lib/api');
const config   = require('../lib/config');
const ui       = require('../lib/ui');
const { VARIANTS, PRESET_RUNTIME, normalizeRuntime, versionField } = require('../lib/runtimes');

// ── Framework presets (mirrors the dashboard exactly) ─────────────────────────
const FRAMEWORKS = [
  { key: 'auto',       label: 'Auto-detect',  install: '',                                        build: '',                    start: '',                                  output: '',      siteType: ''  }, // siteType intentionally blank — buildSettingsWizard() returns early for 'auto' before this is ever read; left blank (not 'static') so this entry can't be mistaken for a real default if that early-return logic ever changes.
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
  // Ruby and Elixir leave the commands blank on purpose: the server's own
  // pipelines pick the right install/build/start for the framework you choose.
  { key: 'ruby',       label: 'Ruby',         install: '',                                        build: '',                    start: '',                                  output: '.',     siteType: 'server'  },
  { key: 'elixir',     label: 'Elixir',       install: '',                                        build: '',                    start: '',                                  output: '.',     siteType: 'server'  },
];
// Record the runtime for presets that have a fixed one (the dashboard does the
// same). Bun, Deno and .NET are sent explicitly when picked; the server also
// detects them from repo files when Runtime is left blank.
for (const f of FRAMEWORKS) f.runtime = PRESET_RUNTIME[f.key] || '';

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

  // Languages with several frameworks: pick one so the server uses the right
  // runtime profile (Django vs Flask, Laravel vs Symfony, Gin, Rails, ...).
  let runtime = fw.runtime || '';
  if (VARIANTS[fw.key]) {
    const v = await choose(`Which ${fw.label} framework?`, VARIANTS[fw.key]);
    runtime = v.val || VARIANTS[fw.key][0].val;
  }

  // [FIX] Auto-detect used to fall straight into the manual prompt flow below
  // (same branch as "don't use defaults"), pre-filled with generic
  // npm-flavored guesses ('npm install', 'npm run build', 'dist' output,
  // Node 20) regardless of what the repo actually is — so picking
  // "Auto-detect" never actually detected anything, it just asked the user
  // to type in the same settings a Node/React project would need, even for
  // a Python or Go repo.
  //
  // The server (buildRunner.js) already does real detection after cloning
  // the repo: engines field for Node version, marker files (composer.json,
  // requirements.txt, go.mod, Gemfile, Cargo.toml, pom.xml, mix.exs, etc.)
  // for non-Node runtimes, and framework-aware install/build command
  // defaults for Node projects. All of that only runs when these fields
  // are left blank — so for real auto-detect, we now just send blank
  // fields and let the server do the actual work, instead of asking
  // anything at all.
  if (fw.key === 'auto') {
    console.log(`\n${c.dim}Auto-detect selected — JoyTree will inspect your repo after cloning it and pick the runtime, install/build/start commands, and Node version automatically.${c.reset}`);
    return { install: '', build: '', start: '', output: '', siteType: '', nodeVer: '', framework: 'auto', runtime: '' };
  }

  let install = fw.install;
  let build   = fw.build;
  let start   = fw.start;
  let output  = fw.output;
  let siteType = fw.siteType;
  let nodeVer = '20';

  // Step 2: Customise or accept defaults
  const customise = await confirm(`\nUse default settings for ${c.bold}${fw.label}${c.reset}?`, true);

  if (!customise) {
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
    if (fw.key.startsWith('node') || fw.key === 'nextjs' || fw.key === 'nuxt' || fw.key === 'vite' || fw.key === 'react-cra' || fw.key === 'bun') {
      const nvChoice = await choose('Node.js version:', NODE_VERSIONS.map(v => ({ label: `Node ${v}`, val: v })));
      nodeVer = nvChoice.val || '20';
    }
  }

  return { install, build, start, output, siteType, nodeVer, framework: fw.key, runtime };
}

// Resolve a project's real internal ID from its subdomain/name via /api/v1/projects
// [FIX] Was /api/v1/transfer -- doesn't exist, always 404'd, meaning this
// function silently fell through to its catch block and just returned the
// raw projectId unresolved every single time.
async function resolveProjectId(projectId) {
  try {
    const ws = await api.get('/api/v1/projects');
    const proj = (ws.projects || []).find(p =>
      p.subdomain === projectId || p.id === projectId || p._id === projectId || p.name === projectId
    );
    return proj ? (proj.id || proj._id || projectId) : projectId;
  } catch (_) {
    return projectId;
  }
}

// ── Poll build status — uses /api/workspace (Firebase-backed, no Mongo) ───────
async function pollStatus(projectId, timeoutMs = 300000, isWorker = false) {
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
        const ws = await api.get('/api/workspace');
        const deploys = Array.isArray(ws.deployments) ? ws.deployments : [];
        // Match on subdomain or projectId — Firebase records store both
        const latest = deploys.find(d =>
          d.subdomain === projectId || d.projectId === projectId || d.name === projectId
        ) || deploys[0];

        if (latest) {
          const status = String(latest.status || '').toLowerCase();
          if (status === 'success') {
            clearInterval(iv);
            if (isTTY) process.stdout.write('\r\x1b[K');
            if (isWorker) {
              console.log(`\n${ui.c.green}${ui.c.bold}Worker is running.${ui.c.reset} ${ui.c.dim}(Background Workers have no public URL)${ui.c.reset}\n`);
              ui.info(`Follow its output: ${ui.c.cyan}joytree logs ${projectId} --follow${ui.c.reset}`);
              return 'success';
            }
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
// Turn the extra `joytree deploy` flags into the fields POST /api/deploy
// understands. Throws an Error with a user-facing message on invalid input.
// `active` is true when any flag fully describes the build, so the
// interactive wizard is skipped (envs alone do not count).
function parseDeployFlags(opts = {}) {
  const extras = {};
  if (opts.worker) extras.isWorker = true;
  if (opts.dockerfile) {
    extras.isDockerfileDeploy = true;
    extras.dockerfilePath = typeof opts.dockerfile === 'string' ? opts.dockerfile.trim() : 'Dockerfile';
  }
  if (opts.dockerCmd)  extras.dockerCommand    = String(opts.dockerCmd).trim();
  if (opts.preDeploy)  extras.preDeployCommand = String(opts.preDeploy).trim();
  if (opts.runtime)    extras.runtime          = normalizeRuntime(opts.runtime);
  if (opts.workdir)    extras.workingDir       = String(opts.workdir).trim();
  if (opts.port !== undefined) {
    const n = Number(opts.port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('--port must be a whole number between 1 and 65535.');
    extras.exposedPort = n;
  }

  if (opts.runtimeVersion) {
    if (!extras.runtime) throw new Error('--runtime-version needs --runtime (for Node.js use --node).');
    const field = versionField(extras.runtime);
    if (!field) throw new Error(`--runtime-version does not apply to "${extras.runtime}" (use --node for Node.js; Bun and Deno have no version pin).`);
    extras[field] = String(opts.runtimeVersion).trim();
  }

  if (opts.worker && opts.static) throw new Error('--worker and --static cannot be combined: a Background Worker is a running process, not a static site.');
  if (opts.worker && opts.dockerfile) throw new Error('--worker and --dockerfile cannot be combined in one deploy: the Dockerfile build path does not apply Background Worker mode. Deploy the worker without --dockerfile.');
  if (opts.worker && !opts.start) throw new Error('--worker needs --start "<command>" (the command that runs your worker).');

  const active = !!(opts.build || opts.start || opts.static || opts.install || opts.output || opts.node || Object.keys(extras).length);

  const envList = Array.isArray(opts.env) ? opts.env : (opts.env ? [opts.env] : []);
  if (envList.length) {
    const envVars = {};
    for (const pair of envList) {
      const i = String(pair).indexOf('=');
      const key = i > 0 ? String(pair).slice(0, i).trim() : '';
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid --env "${pair}". Use KEY=VALUE (KEY may contain letters, digits and underscores).`);
      envVars[key] = String(pair).slice(i + 1);
    }
    extras.envVars = envVars;
  }
  return { extras, active };
}

// Build settings to send on `joytree redeploy`: the project's saved worker /
// Dockerfile / runtime options. /api/deploy overwrites these on every call, so
// leaving them out used to quietly turn a worker or Dockerfile project back
// into a plain web service.
function storedDeployFields(proj = {}) {
  const out = {};
  for (const k of ['runtime', 'pythonVer', 'goVer', 'phpVer', 'rubyVer', 'javaVer', 'dotnetVer', 'workingDir', 'dockerCommand', 'preDeployCommand']) {
    if (typeof proj[k] === 'string' && proj[k].trim()) out[k] = proj[k].trim();
  }
  out.isWorker = !!proj.isWorker;
  out.isDockerfileDeploy = !!proj.isDockerfileDeploy;
  if (proj.isDockerfileDeploy && typeof proj.dockerfilePath === 'string' && proj.dockerfilePath.trim()) out.dockerfilePath = proj.dockerfilePath.trim();
  const port = Number(proj.exposedPort);
  if (Number.isInteger(port) && port > 0 && port < 65536) out.exposedPort = port;
  return out;
}

async function deployGit(opts) {
  if (!config.getApiKey()) { ui.error('Not logged in. Run: joytree login'); process.exit(1); }

  let { repo, branch, name, build, start, static: isStatic } = opts;

  // Validate the build flags first so a typo fails fast, before any prompts.
  let flags;
  try { flags = parseDeployFlags(opts); }
  catch (err) { ui.error(err.message); process.exit(1); }

  // Repo
  if (!repo) {
    if (opts.yes) { ui.error('--yes needs --repo <url>.'); process.exit(1); }
    repo = await ask(`${ui.c.bold}GitHub repo URL${ui.c.reset}`);
    if (!repo) { ui.error('Repository URL is required.'); process.exit(1); }
  }

  // Name
  if (!name) {
    const guessed = repo.split('/').pop().replace(/\.git$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    name = opts.yes ? guessed : await ask(`${ui.c.bold}Project name/subdomain${ui.c.reset}`, guessed);
  }

  // Branch
  if (!branch) {
    branch = opts.yes ? 'main' : await ask(`${ui.c.bold}Branch${ui.c.reset}`, 'main');
  }

  // Build settings — skip if flags were passed, otherwise run wizard
  let settings;
  const hasFlags = flags.active;
  const isWorker = !!flags.extras.isWorker;
  const isDocker = !!flags.extras.isDockerfileDeploy;
  if (hasFlags) {
    settings = {
      install:  opts.install || '',
      build:    build  || '',
      start:    start  || '',
      // Workers and Dockerfile builds are never static; the dashboard sends '.'
      output:   opts.output || ((isWorker || isDocker) ? '.' : 'dist'),
      // [FIX] Was `isStatic ? 'static' : (start ? 'server' : 'static')` --
      // forced 'static' any time neither --static nor --start was passed,
      // even if the person only meant to override --build and wanted the
      // runtime itself auto-detected (same bug class as buildSettingsWizard's
      // "auto" option, fixed earlier). Now: explicit --static wins, an
      // explicit --start implies server, and otherwise siteType is left
      // blank so the server's real post-clone detection gets to run instead
      // of being pre-empted here.
      // A language runtime (python-*, go-*, php-*, bun, dotnet ...) is never a static
      // site; the dashboard sends 'server' for those, so do the same here.
      siteType: isStatic ? 'static' : ((start || isWorker || isDocker || (flags.extras.runtime && !flags.extras.runtime.startsWith('node'))) ? 'server' : ''),
      nodeVer:  opts.node || '20',
      framework:'auto',
    };
  } else if (opts.yes) {
    // Non-interactive with no build flags: let the server detect everything.
    settings = { install: '', build: '', start: '', output: '', siteType: '', nodeVer: '', framework: 'auto' };
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
  if (settings.nodeVer) ui.label('Node ver',  settings.nodeVer);
  const x = flags.extras;
  if (x.runtime || settings.runtime) ui.label('Runtime', x.runtime || settings.runtime);
  if (x.workingDir)         ui.label('Work dir',   x.workingDir);
  if (isWorker)             ui.label('Mode',       'Background Worker (no public URL)');
  if (isDocker)             ui.label('Dockerfile', x.dockerfilePath);
  if (x.dockerCommand)      ui.label('Docker CMD', x.dockerCommand);
  if (x.exposedPort)        ui.label('Port',       String(x.exposedPort));
  if (x.preDeployCommand)   ui.label('Pre-deploy', x.preDeployCommand);
  if (x.envVars)            ui.label('Env vars',   `${Object.keys(x.envVars).length} set`);
  if (!isWorker) ui.label('URL', `https://${name}.joytree.site`);
  console.log();

  const go = opts.yes ? true : await confirm(`${ui.c.bold}Deploy now?${ui.c.reset}`, true);
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
      ...(settings.runtime ? { runtime: settings.runtime } : {}),
      source:     'cli',
      ...flags.extras,
    });

    spin.stop();
    ui.label('Deploy ID', data.deployId || '—');
    console.log();
    await pollStatus(name, undefined, isWorker);
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
    // [FIX] Was /api/v1/transfer -- doesn't exist, so `joytree redeploy`
    // always failed with "Project not found" regardless of a valid
    // subdomain/name, since ws.projects was always undefined from the 404.
    const ws   = await api.get('/api/v1/projects');
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
      ...storedDeployFields(proj),
    });
    spin2.stop();
    ui.label('Deploy ID', data.deployId || '—');
    console.log();
    await pollStatus(projectId, undefined, !!proj.isWorker);
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
    const ws    = await api.get('/api/workspace');
    spin.stop();
    let items = Array.isArray(ws.deployments) ? ws.deployments : [];
    if (projectId) {
      items = items.filter(d => d.subdomain === projectId || d.projectId === projectId || d.name === projectId);
    }
    if (!items.length) { ui.info('No deployments found.'); return; }
    ui.header(`Recent Deployments${projectId ? ' — ' + projectId : ''}`);
    ui.divider();
    items.slice(0, limit).forEach(d => {
      const ts = d.startedAt || d.createdAt ? new Date(d.startedAt || d.createdAt).toLocaleString() : '—';
      console.log(`  ${ui.statusBadge(d.status)}  ${ui.c.bold}${d.subdomain || d.projectName || d.projectId || '—'}${ui.c.reset}  ${ui.c.dim}${ts}${ui.c.reset}`);
      if (d.branch) console.log(`     ${ui.c.dim}branch: ${d.branch}${d.duration ? `  ${d.duration}s` : ''}${ui.c.reset}`);
      // The id is what `joytree rollback` and `joytree stop` take.
      const did = d.id || d._id || d.deployId;
      const sha = d.triggerSha || d.commit || d.sha;
      if (did) console.log(`     ${ui.c.dim}id: ${did}${sha ? `  commit: ${String(sha).slice(0, 7)}` : ''}${ui.c.reset}`);
    });
    console.log();
  } catch (err) {
    spin.stop();
    ui.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { deployGit, redeploy, open, listDeployments, parseDeployFlags, storedDeployFields };
