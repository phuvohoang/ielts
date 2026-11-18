import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const sourcePath=new URL('../worker/wrangler.jsonc',import.meta.url);
const rootPath=new URL('../wrangler.jsonc',import.meta.url);
const source=JSON.parse(readFileSync(sourcePath,'utf8'));
if(source.assets)throw Error('The grading API must not upload website assets.');
if(typeof source.main!=='string'||path.posix.isAbsolute(source.main)||source.main.startsWith('..'))throw Error('Expected a relative Worker entry point.');
const generated=JSON.stringify({...source,main:path.posix.join('worker',source.main)},null,2)+'\n';
if(process.argv.includes('--check')){
 if(!existsSync(rootPath)||readFileSync(rootPath,'utf8')!==generated)throw Error('Root Worker config is out of date. Run npm run worker:sync-config.');
 process.stdout.write('Default Worker configuration matches the canonical API configuration.\n');
}else writeFileSync(rootPath,generated);
