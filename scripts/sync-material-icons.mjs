// Official Google Material Symbols, pinned for reproducible local SVG assets.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const revision='10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7';
const names=['unfold_more','left_panel_close','left_panel_open','menu','close','notifications','help','search','expand_more','mail','schedule','alt_route','delete','add','fit_screen','webhook','zoom_in','zoom_out','refresh','content_copy','send','filter_list','code','more_horiz','arrow_forward','check_circle','radio_button_unchecked','error','progress_activity','arrow_back','menu_book','calendar_month','arrow_downward','arrow_upward','swap_vert','chevron_left','chevron_right','tune','download','check','circle','monitoring','campaign','account_tree','group','description','dashboard','language','key','shield'];
const root=new URL('../apps/dashboard/src/components/icons/',import.meta.url);
await mkdir(root,{recursive:true});
const assets={};
for(let i=0;i<names.length;i+=8) {
  await Promise.all(names.slice(i,i+8).map(async name=>{
    const url=`https://raw.githubusercontent.com/google/material-design-icons/${revision}/symbols/web/${name}/materialsymbolsoutlined/${name}_24px.svg`;
    const response=await fetch(url);if(!response.ok)throw Error(`${name}: ${response.status}`);
    const svg=await response.text();
    const viewBox=svg.match(/viewBox="([^"]+)"/)?.[1];
    const paths=[...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map(match=>match[1]);
    if(!viewBox||!paths.length||/<(?:script|image|use|foreignObject)\b/i.test(svg))throw Error(`Unsupported SVG: ${name}`);
    assets[name]={viewBox,paths};
  }));
}
const license=await fetch(`https://raw.githubusercontent.com/google/material-design-icons/${revision}/LICENSE`);
if(!license.ok)throw Error(`License: ${license.status}`);
const licenseText=await license.text();
await writeFile(new URL('LICENSE',root),licenseText);
const publicLicenses=new URL('../apps/dashboard/public/licenses/',import.meta.url);
await mkdir(publicLicenses,{recursive:true});
await writeFile(new URL('material-symbols-LICENSE.txt',publicLicenses),licenseText);
await writeFile(new URL('paths.json',root),JSON.stringify(Object.fromEntries(Object.entries(assets).sort()),null,2)+'\n');
console.log(`Bundled ${names.length} official Material Symbols in ${fileURLToPath(root)}`);
