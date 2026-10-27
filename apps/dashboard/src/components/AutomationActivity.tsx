import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AutomationDraft, AutomationMetrics } from '@mp/contracts';
import Heading from '@atlaskit/heading';
import { Text } from '@atlaskit/primitives';
import { MetricText } from '@atlaskit/primitives/compiled/metric-text';
import Tabs, { Tab, TabList, TabPanel } from './controls/Tabs';
import { FilterSelect } from './FilterSelect';
import { ErrorBlock, LoadingBlock } from './feedback';
import { AutomationCanvas } from './AutomationCanvas';
import { api } from '../lib/api';

export function AutomationActivity({ id, workflow, runs }: { id: string; workflow: AutomationDraft; runs: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'runs' ? 0 : 1;
  const selectedTab = useRef(tab);
  useEffect(() => { selectedTab.current = tab; }, [tab]);
  const requestedDays = Number(params.get('days'));
  const days = [7, 14, 30].includes(requestedDays) ? requestedDays : 14;
  const setTab = (index: number) => {
    // A pointer selection also focuses the tab. Record one history entry for both events.
    if (selectedTab.current === index) return;
    selectedTab.current = index;
    setParams(previous => { const next = new URLSearchParams(previous); next.set('view', 'activity'); next.set('tab', index === 0 ? 'runs' : 'metrics'); return next; });
  };
  const setDays = (value: number) => setParams(previous => { const next = new URLSearchParams(previous); next.set('days', String(value)); return next; }, { replace: true });
  const q = useQuery({ queryKey: ['automation-metrics', id, days], queryFn: () => api.get<AutomationMetrics>(`/v1/automations/${id}/metrics?days=${days}`), enabled: tab === 1, refetchInterval: 30000 });
  const graph = tab === 1 ? q.data?.workflow ?? workflow : workflow;
  const executions = tab === 1 && q.data ? { trigger: q.data.runs.total, ...Object.fromEntries(q.data.nodes.map(n => [n.node_id, n.executions])) } : undefined;
  return <div className="automation-activity">
    <Tabs id="automation-activity" selected={tab} onChange={setTab}>
      <div className="automation-activity-toolbar"><TabList><Tab>Runs</Tab><Tab>Metrics</Tab></TabList>{tab === 1 && <FilterSelect aria-label="Metrics date range" value={String(days)} onChange={e => setDays(Number(e.target.value))} options={[{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }]} />}</div>
      <TabPanel><Heading as="h2" size="small">Runs</Heading><div className="automation-run-history">{runs}</div></TabPanel>
      <TabPanel>{q.isLoading ? <LoadingBlock label="Loading automation metrics" /> : q.error ? <ErrorBlock title="Could not load metrics" error={q.error} onRetry={() => void q.refetch()} /> : q.data ? <AutomationMetricPanels data={q.data} /> : null}</TabPanel>
    </Tabs>
    <aside className="automation-activity-graph" aria-label={tab === 1 ? 'Workflow executions' : 'Current saved workflow'}>
      <div className="automation-current-workflow-title">{tab === 0 ? 'Current saved workflow' : q.data ? q.data.version ? `Published version ${q.data.version} · UTC` : 'Draft · no executions' : 'Workflow executions'}</div>
      {tab === 1 && (q.isLoading || q.error) ? <div className="automation-metrics-graph-placeholder"><Text color="color.text.subtle">{q.isLoading ? 'Loading executions…' : 'Execution counts unavailable'}</Text></div> : <AutomationCanvas nodes={graph.nodes} entry={graph.entry_node_id} event={graph.trigger_event} selected="" onSelect={() => {}} onAdd={() => {}} editable={false} readOnly executions={executions} />}
    </aside>
  </div>;
}

function AutomationMetricPanels({ data }: { data: AutomationMetrics }) {
  const total = data.runs.total;
  return <div className="automation-metric-panels">
    <section className="automation-metric-panel" aria-labelledby="automation-run-metrics-title">
      <div className="automation-metric-panel-heading"><Heading as="h2" size="small" id="automation-run-metrics-title">Runs</Heading><Text size="small" color="color.text.subtle">{total.toLocaleString()} total</Text></div>
      <div className="automation-metric-values">{(['running', 'completed', 'failed', 'waiting'] as const).map(key => <div key={key}><Text as="p" size="small" color="color.text.subtle">{key[0]!.toUpperCase() + key.slice(1)}</Text><MetricText size="medium">{total ? Math.round(data.runs[key] / total * 100) : 0}%</MetricText><Text as="p" size="small" color="color.text.subtle">{data.runs[key].toLocaleString()} runs</Text></div>)}</div>
      <DailyTrend days={data.daily} field="runs" title="Runs started by day (UTC)" />
      <div className="automation-metric-note">{data.runs.cancelled.toLocaleString()} cancelled · {data.runs.skipped.toLocaleString()} skipped</div>
    </section>
    <section className="automation-metric-panel" aria-labelledby="automation-email-metrics-title">
      <div className="automation-metric-panel-heading"><Heading as="h2" size="small" id="automation-email-metrics-title">Email activity</Heading><Text size="small" color="color.text.subtle">{data.emails.pending.toLocaleString()} pending</Text></div>
      <div className="automation-metric-values automation-email-metric-values"><div><Text as="p" size="small" color="color.text.subtle">Emails</Text><MetricText size="medium">{data.emails.total.toLocaleString()}</MetricText></div><div><Text as="p" size="small" color="color.text.subtle">Server acceptance</Text><MetricText size="medium">{data.emails.total ? Math.round(data.emails.server_accepted / data.emails.total * 100) : 0}%</MetricText><Text as="p" size="small" color="color.text.subtle">{data.emails.server_accepted.toLocaleString()} emails</Text></div></div>
      <DailyTrend days={data.daily} field="emails" title="Emails by submission date (UTC)" />
      <div className="automation-metric-note">Server acceptance does not confirm inbox placement.</div>
    </section>
    <Text as="p" size="small" color="color.text.subtle">{data.version ? `Version ${data.version}. ` : ''}Runs started in this period; statuses reflect their current state.</Text>
  </div>;
}

function DailyTrend({ days, field, title }: { days: AutomationMetrics['daily']; field: 'runs' | 'emails'; title: string }) {
  const maximum = Math.max(1, ...days.map(d => d[field]));
  const x = (i: number) => 32 + i / Math.max(1, days.length - 1) * 608;
  const y = (value: number) => 150 - value / maximum * 126;
  const ticks = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter(i => days[i]);
  return <figure className="automation-metric-chart" aria-label={title}>
    <svg viewBox="0 0 672 180" role="img" aria-label={title}><title>{title}</title><desc>{days.map(d => `${d.date}: ${d[field]}`).join('; ')}</desc>
      {[0, maximum].map(value => <g key={value}><line x1="32" x2="640" y1={y(value)} y2={y(value)} className="automation-chart-grid" /><text x="24" y={y(value) + 4} textAnchor="end">{value.toLocaleString()}</text></g>)}
      <polyline points={days.map((d, i) => `${x(i)},${y(d[field])}`).join(' ')} className="automation-chart-line" />
      {days.map((d, i) => <circle key={d.date} cx={x(i)} cy={y(d[field])} r="3" className="automation-chart-point"><title>{d.date}: {d[field].toLocaleString()}</title></circle>)}
      {ticks.map(i => <text key={i} x={x(i)} y="174" textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{new Date(`${days[i]!.date}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>)}
    </svg>
    <figcaption className="sr-only">{title}. {days.every(d => d[field] === 0) ? 'No activity in this period.' : `${days.reduce((sum, d) => sum + d[field], 0).toLocaleString()} total.`}</figcaption>
  </figure>;
}
