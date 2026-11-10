'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
let checked = 0;
for (const file of ['index.html','admin.html']) {
  const html = fs.readFileSync(file,'utf8');
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [i,tag] of tags.entries()) {
    const attrs=tag[1]||'', source=tag[2]||'';
    if (/\bsrc\s*=/.test(attrs) || !source.trim()) continue;
    try { new vm.Script(source,{filename:`${file} inline script ${i+1}`}); checked++; }
    catch(err) { console.error(`[FAIL] ${file} script ${i+1}: ${err.message}`); process.exitCode=1; }
  }
}
if(!process.exitCode) console.log(`[OK] Syntax checked ${checked} inline script(s) across index.html and admin.html.`);