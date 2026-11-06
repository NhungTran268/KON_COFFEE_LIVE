'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

const files = ['index.html', 'admin.html'];
let checked = 0;
let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

  for (let i = 0; i < tags.length; i++) {
    const attrs = tags[i][1] || '';
    const source = tags[i][2] || '';
    if (/\bsrc\s*=/.test(attrs) || !source.trim()) continue;

    try {
      new vm.Script(source, { filename: file + ':inline-script-' + (i + 1) });
      checked++;
    } catch (error) {
      failed = true;
      console.error('[FAIL] ' + file + ' inline script ' + (i + 1) + ': ' + error.message);
    }
  }
}

if (failed) process.exit(1);
console.log('[OK] Syntax checked ' + checked + ' inline script(s) across ' + files.join(', ') + '.');
