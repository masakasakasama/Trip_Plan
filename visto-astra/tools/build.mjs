import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const result=await build({entryPoints:['src/main.js'],bundle:true,minify:true,format:'esm',write:false});
await writeFile('app.js',result.outputFiles[0].text.replace(/[\t ]+$/gm,''));
