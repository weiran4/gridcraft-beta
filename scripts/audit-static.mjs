import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dirs=['ui','analysis','components','core','project','examples'];
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=['index.html','gfl.html','gfm.html'].map(n=>path.join(root,n)).concat(dirs.flatMap(d=>walk(path.join(root,d))));
const errors=[];let refs=0;
for(const file of files){
 if(!/\.(js|html|css)$/.test(file))continue;
 const text=fs.readFileSync(file,'utf8');
 if(/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(text))errors.push(file+': network API needs review');
 if(/(?:localhost|127\.0\.0\.1|file:\/\/)/.test(text))errors.push(file+': environment-specific runtime reference');
 const patterns=file.endsWith('.html')?[/<(?:script|link)\b[^>]*?(?:src|href|data-entry)=["']([^"']+)["']/g]:file.endsWith('.js')?[/\b(?:import|export)\s+(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g]:[/url\(["']?([^)'"\s]+)/g];
 for(const re of patterns)for(const match of text.matchAll(re)){
  const ref=match[1];if(ref.startsWith('data:')||ref.startsWith('#'))continue;
  if(!ref.startsWith('.')&&file.endsWith('.js')||/^(?:https?:|\/)/.test(ref)){errors.push(file+': non-relative asset '+ref);continue;}
  const target=path.resolve(path.dirname(file),ref.split(/[?#]/)[0]);refs++;
  if(!target.startsWith(root)||!fs.existsSync(target))errors.push(file+': missing/outside asset '+ref);
 }
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`PASS: ${files.length} static files, ${refs} relative references; no network API, backend endpoint, CDN or local runtime reference.`);
