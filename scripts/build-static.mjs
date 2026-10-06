import {createHash} from 'node:crypto';
import {mkdir,cp,writeFile,rm,realpath,readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
// Rebuild only the resolved dist directory inside this project, never a symlink target.
let actual;try{actual=await realpath(out);}catch(error){if(error.code!=='ENOENT')throw error;actual=out;}
if(path.resolve(actual)!==path.resolve(out)||path.dirname(out)!==path.resolve(root))throw Error('Unexpected publish directory');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of ['index.html','gfl.html','gfm.html','pcc.html','pq.html','ui','analysis','components','core','project','examples'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
// A release-wide fingerprint keeps entry modules and every transitive import together.
async function assets(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())found.push(...await assets(p));else if(/\.(html|css|js)$/.test(e.name))found.push(p);}return found.sort();}
const files=await assets(out),hash=createHash('sha256');
for(const f of files)hash.update(path.relative(out,f)).update(await readFile(f));
const release=hash.digest('hex').slice(0,16);
for(const f of files){const text=await readFile(f,'utf8');const stamped=text.replace(/(["'])([^"'\s<>]+?\.(?:js|css))(?:\?[^"'\s<>]*)?\1/g,(all,q,p)=>/^(https?:|data:|\/\/)/.test(p)?all:q+p+'?v='+release+q);await writeFile(f,stamped);}
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Static publish directory: '+out);
