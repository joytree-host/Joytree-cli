'use strict';

const readline = require('readline');
const ui = require('./ui');

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

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const r = rl();
  return new Promise(resolve => {
    r.question(`${question} ${ui.c.dim}[${hint}]${ui.c.reset}: `, ans => {
      r.close();
      const a = ans.trim().toLowerCase();
      resolve(a === '' ? defaultYes : a === 'y' || a === 'yes');
    });
  });
}

module.exports = { ask, confirm };
