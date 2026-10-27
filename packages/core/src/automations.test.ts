import {describe,it,expect} from 'vitest';
import {validateAutomation,automationCondition,personalizeAutomation,validateAutomationProperties} from './automations';
describe('automation graph and expression safety',()=>{
 const c={email:'reader@example.test',firstName:'<Alice>',lastName:'Reader'};
 it('rejects disconnected nodes, cycles and duplicate IDs',()=>{
  const node={id:'a',name:'Wait',type:'delay' as const,seconds:1,next:null};const draft={name:'Flow',trigger_event:'created',entry_node_id:'a',nodes:[node]};expect(()=>validateAutomation(draft)).not.toThrow();expect(()=>validateAutomation({...draft,nodes:[{...node,next:'a'}]})).toThrow('loop');expect(()=>validateAutomation({...draft,nodes:[node,{...node,id:'b'}]})).toThrow('reachable');expect(()=>validateAutomation({...draft,nodes:[node,node]})).toThrow('unique');
 });
 it('escapes HTML substitution and compares scalar values without coercion',()=>{
  expect(personalizeAutomation('<p>{{contact.first_name}} {{event.plan}}</p>',c,{plan:'A&B'},true)).toBe('<p>&lt;Alice&gt; A&amp;B</p>');expect(()=>personalizeAutomation('{{event.missing}}',c,{})).toThrow('Missing');
  const n={id:'a',name:'Check',type:'condition' as const,property:'count',operator:'equals' as const,value:4,yes:null,no:null};expect(automationCondition(n,c,{count:'4'})).toBe(false);expect(automationCondition(n,c,{count:4})).toBe(true);expect(automationCondition({...n,match:'any',clauses:[{property:'plan',operator:'contains',value:'pro'}]},c,{count:0,plan:'pro-plus'})).toBe(true);
 });
 it('checks declared event properties including false and zero',()=>{
  const d={name:'Flow',trigger_event:'created',entry_node_id:null,nodes:[],trigger_schema:[{key:'count',type:'number' as const,required:true},{key:'enabled',type:'boolean' as const,required:true}]};expect(()=>validateAutomationProperties(d,{count:0,enabled:false})).not.toThrow();expect(()=>validateAutomationProperties(d,{count:'0',enabled:false})).toThrow('number');expect(()=>validateAutomationProperties(d,{count:1})).toThrow('Missing');
 });
});
