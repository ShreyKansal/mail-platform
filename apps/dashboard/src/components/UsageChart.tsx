import Heading from '@atlaskit/heading';
import { Text } from '@atlaskit/primitives';

/** A visual summary of API usage; the adjacent data table supplies exact accessible values. */
export function UsageChart({ days, description = 'Emails accepted per active day. Dates use UTC; exact values are listed below.', showEmpty = false }: { days: Array<{ date: string; emails: number }>; description?: string; showEmpty?: boolean }) {
  const maximum = Math.max(1, ...days.map(day => day.emails));
  if (!days.length && !showEmpty) return null;
  return <section className="card usage-chart" aria-labelledby="sending-volume-title">
    <div className="section-intro"><Heading size="small" as="h2" id="sending-volume-title">Sending volume</Heading><Text as="p" color="color.text.subtle">{description}</Text></div>
    {days.length ? <div className="usage-chart-scroll" role="region" aria-label="Sending volume chart" tabIndex={0}><div className="usage-bars" role="list" aria-label="Daily email counts">{[...days].sort((a, b) => a.date.localeCompare(b.date)).map(day => <div className="usage-bar-column" role="listitem" aria-label={`${day.date}: ${day.emails} emails`} key={day.date} title={`${day.date}: ${day.emails} emails`}><span className="usage-bar-value" aria-hidden="true">{day.emails.toLocaleString()}</span><div className="usage-bar-track" aria-hidden="true"><span className="usage-bar" style={{ height: `${day.emails / maximum * 100}%` }} /></div><span aria-hidden="true">{day.date.slice(5, 10)}</span></div>)}</div></div> : <div className="usage-chart-empty"><Text color="color.text.subtle">No sending volume in this period.</Text></div>}
  </section>;
}
