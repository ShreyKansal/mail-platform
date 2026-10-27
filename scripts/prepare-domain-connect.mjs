import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const domain=process.argv[2];
if(!domain||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))throw Error('Usage: node scripts/prepare-domain-connect.mjs <public-service-domain>');
const root=new URL('../',import.meta.url),secretDir=new URL('.data/domain-connect/',root),out=new URL('docs/integrations/domain-connect/',root);
await mkdir(secretDir,{recursive:true});
const privatePath=new URL('signing-key.pem',secretDir);
let privatePem;try{privatePem=await readFile(privatePath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;privatePem=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});await writeFile(privatePath,privatePem,{flag:'wx',mode:0o600});}
const publicKey=createPublicKey(privatePem).export({type:'spki',format:'der'}).toString('base64');
const template=JSON.parse(await readFile(new URL('template.example.json',out),'utf8'));
Object.assign(template,{providerId:domain,providerName:'mymorphix Mailer',syncPubKeyDomain:domain,syncRedirectDomain:domain,logoUrl:`https://${domain}/brand/domain-connect-logo.svg`});
await writeFile(new URL(`${domain}.mail.json`,out),JSON.stringify(template,null,2)+'\n');
const chunks=publicKey.match(/.{1,180}/g),records=chunks.map((data,i)=>({type:'TXT',name:`_dcpubkeyv1.${domain}`,value:`p=${i+1},a=RS256,d=${data}`,ttl:3600}));
await writeFile(new URL('public-key-dns.json',out),JSON.stringify({records},null,2)+'\n');
await writeFile(new URL('deployment.env.example',out),`# Publish the template and public-key DNS before enabling.\nDOMAIN_CONNECT_APPROVED=false\nDOMAIN_CONNECT_PROVIDER_ID=${domain}\nDOMAIN_CONNECT_SERVICE_ID=mail\nDOMAIN_CONNECT_KEY_LABEL=_dcpubkeyv1\nDASHBOARD_ORIGIN=https://${domain}\n# Inject DOMAIN_CONNECT_PRIVATE_KEY from your secret manager.\n# Local development key: .data/domain-connect/signing-key.pem (never commit or publish).\n`);
await mkdir(new URL('apps/dashboard/public/brand/',root),{recursive:true});
await copyFile(new URL('apps/dashboard/src/assets/brand-logo.svg',root),new URL('apps/dashboard/public/brand/domain-connect-logo.svg',root));
console.log(`Prepared ${domain}: template, ${records.length} public DNS records, deployment example and local ignored signing key. No provider submission or DNS changes.`);
