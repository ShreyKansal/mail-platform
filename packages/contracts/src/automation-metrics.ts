import {z} from 'zod';
import {automationDraft} from './automations';
const count=z.number().int().nonnegative();
export const automationMetricsQuery=z.object({days:z.coerce.number().int().min(1).max(90).default(14)}).strict();
export const automationMetricsView=z.object({
 days:count,from:z.string(),to:z.string(),version:count.nullable(),workflow:automationDraft.nullable(),
 runs:z.object({total:count,running:count,waiting:count,completed:count,failed:count,cancelled:count,skipped:count}),
 emails:z.object({total:count,queued:count,server_accepted:count,bounced:count,failed:count,pending:count,suppressed:count,cancelled:count}),
 daily:z.array(z.object({date:z.string(),runs:count,completed:count,failed:count,emails:count,server_accepted:count})),
 nodes:z.array(z.object({node_id:z.string(),executions:count,completed:count,failed:count,waiting:count,skipped:count,emails:count})),
});
export type AutomationMetrics=z.infer<typeof automationMetricsView>;
