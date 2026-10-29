/** Exercise the real builder in temporary fixtures, never checked-out dist. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function walk(root,dir=root){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?walk(root,path.join(dir,e.name)):[path.relative(root,path.join(dir,e.name)).split(path.sep).join('/')]))).flat().sort();}
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'gfl-release-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['scripts','ui','analysis','components','core','project','examples'])await mkdir(path.join(root,dir));
 await cp(new URL('../scripts/build-static.mjs',import.meta.url),path.join(root,'scripts/build-static.mjs'));
 for(const name of ['index','gfl','gfm','pcc','pq','structure'])await writeFile(path.join(root,name+'.html'),'<script type="module" src="./ui/entry.js?old=1"></script><link rel="stylesheet" href="./ui/view.css">');
 await writeFile(path.join(root,'ui/entry.js'),"import '../analysis/model.js'; const worker=new Worker(new URL('../ui/worker.js',import.meta.url));\n");
 await writeFile(path.join(root,'ui/worker.js'),"import '../analysis/model.js';\n");
 await writeFile(path.join(root,'analysis/model.js'),'export const version=1;\n');
 await writeFile(path.join(root,'ui/view.css'),'body { color: #123; }\n');
 await writeFile(path.join(root,'examples/input.json'),'{"preserved":true}\n');
 await writeFile(path.join(root,'examples/pixel.bin'),Buffer.from([0,1,2,255]));
 return root;
}
function build(root){execFileSync(process.execPath,[path.join(root,'scripts/build-static.mjs')],{cwd:root,stdio:'pipe'});}

test('release manifest hashes actual stamped bytes of every published asset and one import identity',async t=>{
 const root=await fixture(t);build(root);const dist=path.join(root,'dist');
 const exists=(await walk(dist)).includes('release.json');
 assert.equal(exists,true,'build must emit release.json after import stamping');
 const manifest=JSON.parse(await readFile(path.join(dist,'release.json'),'utf8'));
 assert.match(manifest.releaseId,/^[a-f0-9]{16}$/);assert.equal(manifest.sourceCommit,null);
 assert.equal(manifest.sourceState.kind,'unversioned');
 const paths=(await walk(dist)).filter(p=>p!=='release.json');assert.deepEqual(Object.keys(manifest.files).sort(),paths);
 for(const name of paths)assert.equal(manifest.files[name],sha(await readFile(path.join(dist,name))),name+' digest uses actual published bytes');
 const prestamp=createHash('sha256');
 for(const name of paths.filter(n=>/\.(html|css|js)$/.test(n)).sort())prestamp.update(name).update(await readFile(path.join(root,name)));
 assert.equal(manifest.releaseId,prestamp.digest('hex').slice(0,16),'reuse existing pre-stamp fingerprint');
 let references=0;
 for(const name of paths.filter(n=>/\.(html|css|js)$/.test(n))){
  const text=await readFile(path.join(dist,name),'utf8');
  for(const [,ref] of text.matchAll(/["']([^"'\s]+\.(?:js|css)\?[^"'\s]+)["']/g)){
   references++;assert.equal(new URL(ref,'https://fixture.invalid/').searchParams.get('v'),manifest.releaseId);
  }
 }
 assert.ok(references>=13,'HTML entries, transitive imports and Worker URL are checked');
 const same=await readFile(path.join(dist,'release.json'),'utf8');build(root);assert.equal(await readFile(path.join(dist,'release.json'),'utf8'),same);
 await writeFile(path.join(root,'analysis/model.js'),'export const version=2;\n');build(root);
 const next=JSON.parse(await readFile(path.join(dist,'release.json'),'utf8'));assert.notEqual(next.releaseId,manifest.releaseId);
 assert.notEqual(next.files['analysis/model.js'],manifest.files['analysis/model.js']);
});

test('release build preserves evidence outside the normal dist target',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'artifacts'));const evidence=path.join(root,'artifacts/evidence.json');
 await writeFile(evidence,'{"retained":true}\n');build(root);assert.equal(await readFile(evidence,'utf8'),'{"retained":true}\n');
});
