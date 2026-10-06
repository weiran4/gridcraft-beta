import {mkdir,cp,writeFile,rm,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
// Rebuild only the resolved dist directory inside this project, never a symlink target.
let actual;try{actual=await realpath(out);}catch(error){if(error.code!=='ENOENT')throw error;actual=out;}
if(path.resolve(actual)!==path.resolve(out)||path.dirname(out)!==path.resolve(root))throw Error('Unexpected publish directory');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of ['index.html','gfl.html','gfm.html','pcc.html','pq.html','ui','analysis','components','core','project','examples'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Static publish directory: '+out);
