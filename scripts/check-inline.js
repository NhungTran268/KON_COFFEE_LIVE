'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const tags = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
let checked = 0;
let failed = false;

for (let i = 0; i < tags.length; i++) {
  const attrs = tags[i][1] || '';
  const code = tags[i][2] || '';
  if (/\\bsrc\\s*=/.test(attrs) || !code.trim()) continue;
  try {
    new vm.Script(code, { filename: 'index.html:inline-script-' + (i + 1) });
    checked++;
  } catch (error) {
    failed = true;
    console.error('[FAIL] Inline script ' + (i + 1) + ': ' + error.message);
  }
}

if (failed) process.exit(1);
console.log('[OK] Syntax checked ' + checked + ' inline script(s) in index.html.');
