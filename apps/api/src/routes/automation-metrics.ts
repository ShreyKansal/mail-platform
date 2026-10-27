import type {FastifyInstance} from 'fastify';
import type {ZodTypeProvider} from 'fastify-type-provider-zod';
import {automationMetricsQuery,automationMetricsView,uuidParam,type AutomationMetrics} from '@mp/contracts';
import {automations,automationVersions,and,eq,sql,type Tx} from '@mp/database';
import {AppError} from '@mp/shared';
import {principalOf,type Principal} from '../context';

const dayMs=86400000;
type RunGroup={date:string;status:keyof Omit<AutomationMetrics['runs'],'total'>;count:number};
type EmailGroup={date:string}&AutomationMetrics['emails'];
type NodeGroup=AutomationMetrics['nodes'][number];
type Aggregate={runs:RunGroup[];emails:EmailGroup[];nodes:NodeGroup[]};

/** UTC calendar-day cohort: current outcomes for runs enrolled in this window. */
export async function loadAutomationMetrics(tx:Tx,p:Pick<Principal,'orgId'|'projectId'>,id:string,days:number,now=new Date()):Promise<AutomationMetrics>{
 const [automation]=await tx.select({id:automations.id,version:automations.publishedVersion}).from(automations).where(and(eq(automations.id,id),eq(automations.orgId,p.orgId),eq(automations.projectId,p.projectId)));
 if(!automation)throw new AppError('not_found','Automation not found');
 const from=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-(days-1)*dayMs);
 const result:AutomationMetrics={days,from:from.toISOString(),to:now.toISOString(),version:automation.version,workflow:null,runs:{total:0,running:0,waiting:0,completed:0,failed:0,cancelled:0,skipped:0},emails:{total:0,queued:0,server_accepted:0,bounced:0,failed:0,pending:0,suppressed:0,cancelled:0},daily:Array.from({length:days},(_,i)=>({date:new Date(from.getTime()+i*dayMs).toISOString().slice(0,10),runs:0,completed:0,failed:0,emails:0,server_accepted:0})),nodes:[]};
 if(automation.version===null)return result;
 const [version]=await tx.select({definition:automationVersions.definition}).from(automationVersions).where(and(eq(automationVersions.automationId,id),eq(automationVersions.version,automation.version),eq(automationVersions.orgId,p.orgId),eq(automationVersions.projectId,p.projectId)));
 if(!version)throw new AppError('internal_error','Published automation version is unavailable.');
 result.workflow=version.definition;
 // Separate aggregates over run, step and distinct email cohorts prevent fan-out overcounting.
 // One SQL statement gives all counts a consistent snapshot while workers continue processing.
 const data=await tx.execute<Aggregate>(sql`
 with cohort as materialized (
   select r.id,r.created_at,r.status from automation_runs r
   where r.org_id=${p.orgId}::uuid and r.project_id=${p.projectId}::uuid
     and r.automation_id=${id}::uuid and r.version=${automation.version}
     and r.created_at>=${from} and r.created_at<=${now}
 ), steps as materialized (
   select s.* from automation_steps s join cohort r on r.id=s.run_id
   where s.org_id=${p.orgId}::uuid and s.project_id=${p.projectId}::uuid
     and s.started_at>=${from} and s.started_at<=${now}
 ), mail as materialized (
   select e.id,e.created_at,
     coalesce(bool_or(er.state in ('QUEUED','SCHEDULED')),false) as queued,
     coalesce(bool_or(er.state='REMOTE_ACCEPTED'),false) as server_accepted,
     coalesce(bool_or(er.state='BOUNCED'),false) as bounced,
     coalesce(bool_or(er.state in ('FAILED','REJECTED')),false) as failed,
     coalesce(bool_or(er.state in ('CREATED','VALIDATING','ACCEPTED','DISPATCHING','MTA_ACCEPTED','RETRYING','DEFERRED','DELIVERY_UNKNOWN')),true) as pending,
     coalesce(bool_or(er.state='SUPPRESSED'),false) as suppressed,
     coalesce(bool_or(er.state='CANCELLED'),false) as cancelled
   from emails e left join email_recipients er on er.email_id=e.id and er.org_id=${p.orgId}::uuid
   where e.org_id=${p.orgId}::uuid and e.project_id=${p.projectId}::uuid
     and e.created_at>=${from} and e.created_at<=${now}
     and exists(select 1 from steps s where s.email_id=e.id)
   group by e.id,e.created_at
 ), run_days as (
   select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as date,status,count(*)::int as count from cohort group by 1,status
 ), email_days as (
   select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as date,count(*)::int as total,
     count(*) filter(where queued)::int as queued,count(*) filter(where server_accepted)::int as server_accepted,
     count(*) filter(where bounced)::int as bounced,count(*) filter(where failed)::int as failed,
     count(*) filter(where pending)::int as pending,count(*) filter(where suppressed)::int as suppressed,
     count(*) filter(where cancelled)::int as cancelled from mail group by 1
 ), node_totals as (
   select node_id,count(*)::int as executions,count(*) filter(where status='completed')::int as completed,
     count(*) filter(where status='failed')::int as failed,count(*) filter(where status='waiting')::int as waiting,
     count(*) filter(where status='skipped')::int as skipped,count(distinct email_id)::int as emails from steps group by node_id
 )
 select coalesce((select json_agg(run_days) from run_days),'[]'::json) as runs,
   coalesce((select json_agg(email_days) from email_days),'[]'::json) as emails,
   coalesce((select json_agg(node_totals) from node_totals),'[]'::json) as nodes
 `);
 const groups=data.rows[0]!;
 const daily=new Map(result.daily.map(day=>[day.date,day]));
 for(const group of groups.runs){result.runs.total+=group.count;result.runs[group.status]+=group.count;const day=daily.get(group.date)!;day.runs+=group.count;if(group.status==='completed')day.completed+=group.count;if(group.status==='failed')day.failed+=group.count;}
 for(const group of groups.emails){for(const key of Object.keys(result.emails) as Array<keyof AutomationMetrics['emails']>)result.emails[key]+=group[key];const day=daily.get(group.date)!;day.emails+=group.total;day.server_accepted+=group.server_accepted;}
 const nodes=new Map(groups.nodes.map(node=>[node.node_id,node]));
 result.nodes=version.definition.nodes.map(node=>nodes.get(node.id)??{node_id:node.id,executions:0,completed:0,failed:0,waiting:0,skipped:0,emails:0});
 return result;
}

export function automationMetricsRoutes(app:FastifyInstance){
 app.withTypeProvider<ZodTypeProvider>().get('/v1/automations/:id/metrics',{
  config:{permission:'automations:read'},schema:{tags:['Automations'],summary:'Current outcomes of runs enrolled in a UTC date window, for the latest published workflow version',params:uuidParam,querystring:automationMetricsQuery,response:{200:automationMetricsView}},
 },async req=>{const p=principalOf(req.principal);return req.tenant(tx=>loadAutomationMetrics(tx,p,req.params.id,req.query.days));});
}
