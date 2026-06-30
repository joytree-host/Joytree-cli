'use strict';

const isTTY = process.stdout.isTTY;

const c = {
  reset:   isTTY ? '\x1b[0m'  : '',
  bold:    isTTY ? '\x1b[1m'  : '',
  dim:     isTTY ? '\x1b[2m'  : '',
  green:   isTTY ? '\x1b[32m' : '',
  cyan:    isTTY ? '\x1b[36m' : '',
  yellow:  isTTY ? '\x1b[33m' : '',
  red:     isTTY ? '\x1b[31m' : '',
  blue:    isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  white:   isTTY ? '\x1b[37m' : '',
  gray:    isTTY ? '\x1b[90m' : '',
};

function logo() {
  const pkg = require('../package.json');
  // Deep green block letters JOYTREE
  const green = isTTY ? '\x1b[38;5;22m' : ''; // deep green
  console.log('');
  console.log(`${c.bold}${green}     ██╗ ██████╗ ██╗   ██╗████████╗██████╗ ███████╗███████╗${c.reset}`);
  console.log(`${c.bold}${green}     ██║██╔═══██╗╚██╗ ██╔╝╚══██╔══╝██╔══██╗██╔════╝██╔════╝${c.reset}`);
  console.log(`${c.bold}${green}     ██║██║   ██║ ╚████╔╝    ██║   ██████╔╝█████╗  █████╗  ${c.reset}`);
  console.log(`${c.bold}${green}██   ██║██║   ██║  ╚██╔╝     ██║   ██╔══██╗██╔══╝  ██╔══╝  ${c.reset}`);
  console.log(`${c.bold}${green}╚█████╔╝╚██████╔╝   ██║      ██║   ██║  ██║███████╗███████╗${c.reset}`);
  console.log(`${c.bold}${green} ╚════╝  ╚═════╝    ╚═╝      ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝${c.reset}`);
  console.log('');
  // Iconic tagline — not pxxl-style, our own identity
  console.log(`  ${c.cyan}${c.bold}Deploy. Scale. Own it.${c.reset}  ${c.gray}v${pkg.version}${c.reset}`);
  console.log(`  ${c.gray}─────────────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.gray}Your platform. Your rules. Powered by joytree.site${c.reset}`);
  console.log('');
}

function success(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function info(msg)    { console.log(`${c.cyan}ℹ${c.reset} ${msg}`); }
function warn(msg)    { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function error(msg)   { console.error(`${c.red}✗${c.reset} ${c.red}${msg}${c.reset}`); }
function label(k, v)  { console.log(`  ${c.bold}${k}${c.reset}${c.dim}:${c.reset} ${v}`); }
function header(msg)  { console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`); }
function divider()    { console.log(c.gray + '─'.repeat(52) + c.reset); }

function statusBadge(status) {
  const map = {
    success:   `${c.green}● success${c.reset}`,
    live:      `${c.green}● live${c.reset}`,
    running:   `${c.green}● running${c.reset}`,
    active:    `${c.green}● active${c.reset}`,
    failed:    `${c.red}● failed${c.reset}`,
    error:     `${c.red}● error${c.reset}`,
    stopped:   `${c.yellow}● stopped${c.reset}`,
    pending:   `${c.yellow}● pending${c.reset}`,
    building:  `${c.blue}● building${c.reset}`,
    deploying: `${c.blue}● deploying${c.reset}`,
    idle:      `${c.gray}● idle${c.reset}`,
  };
  return map[String(status).toLowerCase()] || `${c.gray}● ${status || '—'}${c.reset}`;
}

function spinner(msg) {
  if (!isTTY) { process.stdout.write(msg + '...\n'); return { stop: (s) => { if (s) success(s); } }; }
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  process.stdout.write('\x1b[?25l');
  const iv = setInterval(() => {
    process.stdout.write(`\r${c.cyan}${frames[i++ % frames.length]}${c.reset} ${msg}`);
  }, 80);
  return {
    stop(successMsg) {
      clearInterval(iv);
      process.stdout.write('\x1b[?25h');
      process.stdout.write('\r\x1b[K');
      if (successMsg) success(successMsg);
    }
  };
}

module.exports = { c, logo, success, info, warn, error, label, header, divider, statusBadge, spinner };
