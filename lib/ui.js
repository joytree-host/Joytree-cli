'use strict';

// ANSI colours (auto-disabled if not a TTY)
const isTTY = process.stdout.isTTY;

const c = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  green:  isTTY ? '\x1b[32m' : '',
  cyan:   isTTY ? '\x1b[36m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red:    isTTY ? '\x1b[31m' : '',
  blue:   isTTY ? '\x1b[34m' : '',
  magenta:isTTY ? '\x1b[35m' : '',
  white:  isTTY ? '\x1b[37m' : '',
};

function logo() {
  const pkg = require('../package.json');
  console.log('');
  console.log(`${c.bold}${c.white}     ██╗ ██████╗ ██╗   ██╗████████╗██████╗ ███████╗███████╗${c.reset}`);
  console.log(`${c.bold}${c.white}     ██║██╔═══██╗╚██╗ ██╔╝╚══██╔══╝██╔══██╗██╔════╝██╔════╝${c.reset}`);
  console.log(`${c.bold}${c.white}     ██║██║   ██║ ╚████╔╝    ██║   ██████╔╝█████╗  █████╗  ${c.reset}`);
  console.log(`${c.bold}${c.white}██   ██║██║   ██║  ╚██╔╝     ██║   ██╔══██╗██╔══╝  ██╔══╝  ${c.reset}`);
  console.log(`${c.bold}${c.white}╚█████╔╝╚██████╔╝   ██║      ██║   ██║  ██║███████╗███████╗${c.reset}`);
  console.log(`${c.bold}${c.white} ╚════╝  ╚═════╝    ╚═╝      ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝${c.reset}`);
  console.log('');
  console.log(`  Go live on Joytree in seconds!  ${c.dim}v${pkg.version}${c.reset}`);
  console.log(`  Website  ${c.cyan}https://joytree.site${c.reset}`);
  console.log(`  Docs     ${c.cyan}https://docs.joytree.site${c.reset}`);
  console.log('');
}

function success(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function info(msg)    { console.log(`${c.cyan}ℹ${c.reset} ${msg}`); }
function warn(msg)    { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function error(msg)   { console.error(`${c.red}✗${c.reset} ${c.red}${msg}${c.reset}`); }
function label(k, v)  { console.log(`  ${c.bold}${k}${c.reset}${c.dim}:${c.reset} ${v}`); }
function header(msg)  { console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`); }
function divider()    { console.log(c.dim + '─'.repeat(52) + c.reset); }

function table(rows) {
  if (!rows.length) return;
  // Find column widths
  const keys = Object.keys(rows[0]);
  const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)));
  const pad = (s, w) => String(s ?? '').padEnd(w);
  const row = r => keys.map((k, i) => pad(r[k], widths[i])).join('  ');
  const sep = widths.map(w => '─'.repeat(w)).join('  ');

  console.log(c.bold + row(Object.fromEntries(keys.map(k => [k, k.toUpperCase()]))) + c.reset);
  console.log(c.dim + sep + c.reset);
  rows.forEach(r => console.log(row(r)));
}

function statusBadge(status) {
  const map = {
    success: `${c.green}● success${c.reset}`,
    live:    `${c.green}● live${c.reset}`,
    running: `${c.green}● running${c.reset}`,
    failed:  `${c.red}● failed${c.reset}`,
    error:   `${c.red}● error${c.reset}`,
    stopped: `${c.yellow}● stopped${c.reset}`,
    pending: `${c.yellow}● pending${c.reset}`,
    building:`${c.blue}● building${c.reset}`,
    deploying:`${c.blue}● deploying${c.reset}`,
  };
  return map[String(status).toLowerCase()] || `${c.dim}● ${status}${c.reset}`;
}

function spinner(msg) {
  if (!isTTY) { process.stdout.write(msg + '...\n'); return { stop: () => {} }; }
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  process.stdout.write('\x1b[?25l'); // hide cursor
  const iv = setInterval(() => {
    process.stdout.write(`\r${c.cyan}${frames[i++ % frames.length]}${c.reset} ${msg}`);
  }, 80);
  return {
    stop(successMsg) {
      clearInterval(iv);
      process.stdout.write('\x1b[?25h'); // show cursor
      process.stdout.write('\r\x1b[K'); // clear line
      if (successMsg) success(successMsg);
    }
  };
}

module.exports = { c, logo, success, info, warn, error, label, header, divider, table, statusBadge, spinner };
