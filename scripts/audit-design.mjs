import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const snapshot=JSON.parse(await readFile(resolve(root,'docs/design/ads-tokens.json'),'utf8'));
const allowed=new Set(snapshot.tokens.map(x=>x.css_variable).filter(Boolean));
const errors=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(css|tsx?|jsx?)$/.test(entry.name)){const text=await readFile(path,'utf8');const relative=path.slice(root.length+1);const report=(offset,message)=>errors.push(`${relative}:${text.slice(0,offset).split('\n').length}: ${message}`);
for(const match of text.matchAll(/var\((--ds-[a-z0-9-]+)/g))if(!allowed.has(match[1]))report(match.index,'Unknown ADS token '+match[1]);
for(const match of text.matchAll(/from\s+['"](@atlaskit\/(?:side-navigation|atlassian-navigation|page-layout|layout-grid)(?:\/[^'"]*)?)['"]/g))report(match.index,'Deprecated layout import '+match[1]);
if(entry.name.endsWith('.css')){
for(const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
if(/\.(?:table-scroll|email-results)\s+(?:th|td|tbody)\b|\.card\s+h[1-6]\b/.test(rule[1]) && /(?:font|padding|background|color)\s*:/.test(rule[2]))report(rule.index,'Do not override Atlaskit table/heading internals; style the surrounding container.');
}
for(const match of text.matchAll(/(?:^|[;{\n])\s*((?:padding|margin)(?:-[a-z-]+)?|gap|column-gap|row-gap|font-size)\s*:\s*([^;}]+)/g)){
if(/\b\d+(?:\.\d+)?px\b/.test(match[2])&&!/calc\(/.test(match[2]))report(match.index,'Use ADS tokens for '+match[1]+': '+match[2].trim());
}
}
}}}
await walk(resolve(root,'apps/dashboard/src'));
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Design audit passed: ADS variables match ${snapshot.count} installed tokens; no deprecated layout imports or raw spacing/font sizes. Explicit layout geometry and breakpoints are allowed.`);
