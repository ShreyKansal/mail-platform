import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {unsubscribeToken,verifyUnsubscribeToken,broadcastInput,validateBroadcastContent,type BroadcastRow} from './broadcasts';
const secret='test-broadcast-secret-only-not-production';
describe('broadcast capability links and admission',()=>{
 it('binds unsubscribe tokens to the exact tenant, project and contact and rejects tampering',()=>{
  const o=randomUUID(),p=randomUUID(),c=randomUUID(),token=unsubscribeToken(o,p,c,secret);
  expect(verifyUnsubscribeToken(token,secret)).toEqual({o,p,c});
  expect(()=>verifyUnsubscribeToken(token+'x',secret)).toThrow();
  expect(()=>verifyUnsubscribeToken(token,secret+'different')).toThrow();
  expect(()=>verifyUnsubscribeToken('invalid.token.extra',secret)).toThrow();
 });
 it('creates separate marketing email input with one-click headers and a visible unsubscribe in each body',()=>{
  const b={id:randomUUID(),orgId:randomUUID(),projectId:randomUUID(),from:'sender@example.test',replyTo:null,subject:'News',html:'<p>Hello</p>',text:'Hello',publicApiUrl:'https://mail.example.test'} as BroadcastRow;
  const c={id:randomUUID(),email:'reader@example.test'},input=broadcastInput(b,c,secret);
  expect(input.stream).toBe('marketing');expect(input.to).toEqual([c.email]);expect(input.cc).toEqual([]);expect(input.metadata).toEqual({broadcast_id:b.id});
  const url=input.headers['List-Unsubscribe']!.slice(1,-1);expect(url).toMatch(/^https:\/\/mail.example.test\/v1\/broadcast-unsubscribe\//);
  expect(input.html).toContain(url);expect(input.text).toContain(url);expect(input.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  const token=new URL(url).pathname.split('/').at(-1)!;expect(verifyUnsubscribeToken(token,secret)).toEqual({o:b.orgId,p:b.projectId,c:c.id});
 });
 it('allows incomplete stored drafts but requires complete content at admission',()=>{
  expect(()=>validateBroadcastContent({from:'',replyTo:null,subject:'',html:'',text:''})).toThrow();
  expect(()=>validateBroadcastContent({from:'sender@example.test',replyTo:null,subject:'Subject',html:'',text:'Text only'})).not.toThrow();
 });
});
