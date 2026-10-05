import {mkdir,cp,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
await mkdir(out,{recursive:true});
for(const name of ['index.html','gfl.html','ui','analysis','components','core','project','examples'])await cp(path.join(root,name),path.join(out,name),{recursive:true});
await writeFile(path.join(out,'.nojekyll'),'');
console.log('Static publish directory: '+out);
