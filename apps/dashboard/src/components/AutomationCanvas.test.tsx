import { describe, expect, it } from 'vitest';
import type { AutomationNode } from '@mp/contracts';
import { automationEdges, layoutAutomation } from './AutomationCanvas';

const wait=(id:string,next:string|null):AutomationNode=>({id,type:'delay',name:id,seconds:60,next});
describe('automation graph layout',()=>{
 it('keeps branches distinct, merges below both parents, and preserves executable destinations',()=>{
  const nodes:AutomationNode[]=[{id:'branch',name:'Plan',type:'condition',property:'plan',operator:'equals',value:'pro',yes:'left',no:'right'},wait('left','merge'),wait('right','merge'),wait('merge',null)];
  const graph=layoutAutomation(nodes,'branch');
  expect(graph.positions.size).toBe(4);
  expect(graph.positions.get('left')!.x).not.toBe(graph.positions.get('right')!.x);
  for(const node of nodes)for(const edge of automationEdges(node))if(edge.to)expect(graph.positions.get(edge.to)!.y).toBeGreaterThan(graph.positions.get(node.id)!.y);
  expect(automationEdges(nodes[0]!)).toEqual([{to:'left',label:'Matched'},{to:'right',label:'Otherwise'}]);
 });
 it('bounds malformed external cycles and renders every disconnected or large-workflow node',()=>{
  const cycle=layoutAutomation([wait('a','b'),wait('b','a'),wait('orphan','missing')],null);
  expect(cycle.positions.size).toBe(3);expect(cycle.height).toBeLessThan(2000);
  const graph=layoutAutomation(Array.from({length:50},(_,i)=>wait(`step${i}`,i===49?null:`step${i+1}`)),'step0');
  expect(graph.positions.size).toBe(50);expect(new Set([...graph.positions.values()].map(p=>`${p.x}:${p.y}`)).size).toBe(50);
 });
});
