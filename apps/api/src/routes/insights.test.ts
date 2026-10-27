import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import type { Tx } from '@mp/database';
import type { AppDeps, Principal } from '../context';
import { insightRoutes } from './insights';

function primitives(value: unknown): Array<string|number> {
  if(typeof value==='string'||typeof value==='number') return [value];
  if(Array.isArray(value)) return value.flatMap(primitives);
  if(value&&typeof value==='object') {
    if('queryChunks' in value) return primitives(value.queryChunks);
    if('value' in value) return primitives(value.value);
  }
  return [];
}
function harness() {
  const app=Fastify();app.setValidatorCompiler(validatorCompiler);app.setSerializerCompiler(serializerCompiler);
  const conditions: unknown[]=[];
  const results: unknown[][]=[[{state:'REMOTE_ACCEPTED',n:12},{state:'BOUNCED',n:2}],[{total:3,verified:2}],[{n:1}],[{n:999}],[{limit:1000,unlimited:false}]];
  let index=0;
  const tx={select:()=>{
    const result=results[index++] ?? [];
    const chain={from:()=>chain,innerJoin:()=>chain,where:(condition:unknown)=>{conditions.push(condition);return chain;},groupBy:async()=>result,then:(resolve:(value:unknown[])=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve(result).then(resolve,reject)};
    return chain;
  }};
  app.addHook('preHandler',async req=>{req.principal={kind:'user',orgId:'org-1',projectId:'project-1'} as Principal;req.tenant=async fn=>fn(tx as unknown as Tx);});
  insightRoutes(app,{core:{localUnlimitedSending:false}} as AppDeps);
  return {app,conditions};
}
describe('Overview period',()=>{
  it('filters recipient states by the selected hours while retaining daily quota usage',async()=>{
    const {app,conditions}=harness();try{
      const response=await app.inject('/v1/overview?hours=168');expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({window_hours:168,submitted_in_window:14,used_last_24h:999,verified_domains:2});
      const stateValues=primitives(conditions[0]);expect(stateValues).toContain(168);expect(stateValues).toContain('org-1');expect(stateValues).toContain('project-1');
      expect(primitives(conditions[3]).join(' ')).toContain("interval '24 hours'");
    }finally{await app.close();}
  });
  it('keeps the existing one-day default',async()=>{
    const {app}=harness();try{const response=await app.inject('/v1/overview');expect(response.statusCode).toBe(200);expect(response.json().window_hours).toBe(24);}finally{await app.close();}
  });
  it('rejects invalid windows before querying data',async()=>{
    const {app,conditions}=harness();try{for(const hours of ['0','2161','2.5','bad'])expect((await app.inject('/v1/overview?hours='+hours)).statusCode).toBe(400);expect(conditions).toEqual([]);}finally{await app.close();}
  });
});
