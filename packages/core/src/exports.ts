import { randomUUID } from 'node:crypto';
import { exportFilters } from '@mp/contracts';
import { aggregateStatus, type RecipientState } from '@mp/mail-protocol';
import { AppError, csvCell, type Logger } from '@mp/shared';
import { and, asc, desc, emailRecipients, emails, eq, exportChunks, exportJobs, inArray, sql, type Db } from '@mp/database';

const PAGE_SIZE = 500;
export const MAX_EXPORT_ROWS = 100_000;
export const exportView = (job: typeof exportJobs.$inferSelect) => ({ id: job.id, status: job.status, row_count: job.rowCount, error: job.error,
  created_at: job.createdAt.toISOString(), completed_at: job.completedAt?.toISOString() ?? null, expires_at: job.expiresAt.toISOString() });
const header = '\uFEFF' + ['ID', 'From', 'To', 'Subject', 'Status', 'Source', 'Created', 'Scheduled', 'Test mode'].map(csvCell).join(',') + '\r\n';

/** One bounded page per tick. The page and its checkpoint commit atomically. */
export class ExportWorker {
  constructor(private readonly db: Db, private readonly log?: Logger) {}
  async tick(): Promise<number> {
    const token = randomUUID();
    const claimed = await this.db.execute<{ id: string }>(sql`update export_jobs set status = 'running', lease_token = ${token}, lease_until = now() + interval '2 minutes'
      where id = (select id from export_jobs where (status = 'queued' or (status = 'running' and lease_until < now())) and expires_at > now()
        order by created_at limit 1 for update skip locked) returning id`);
    const id = claimed.rows[0]?.id;
    if (!id) return 0;
    try {
      await this.db.transaction(async (tx) => {
        const [job] = await tx.select().from(exportJobs).where(and(eq(exportJobs.id, id), eq(exportJobs.leaseToken, token))).for('update');
        if (!job) return;
        const filters = exportFilters.parse(job.filters);
        const rows = await tx.select().from(emails).where(and(eq(emails.orgId, job.orgId), eq(emails.projectId, job.projectId),
          sql`${emails.createdAt} <= (select created_at from export_jobs where id = ${id})`,
          filters.created_after ? sql`${emails.createdAt} >= ${filters.created_after}::timestamptz` : undefined,
          filters.created_before ? sql`${emails.createdAt} < ${filters.created_before}::timestamptz` : undefined,
          filters.api_key_id ? eq(emails.apiKeyId, filters.api_key_id) : undefined,
          filters.source ? eq(emails.source, filters.source) : undefined,
          filters.test_mode !== undefined ? eq(emails.isTest, filters.test_mode === 'true') : undefined,
          filters.status ? sql`exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and ${emailRecipients.state} = ${filters.status})` : undefined,
          filters.search ? sql`(strpos(lower(${emails.subject}), lower(${filters.search})) > 0 or strpos(lower(${emails.fromAddress}), lower(${filters.search})) > 0 or exists (select 1 from ${emailRecipients} where ${emailRecipients.emailId} = ${emails.id} and strpos(lower(${emailRecipients.address}), lower(${filters.search})) > 0))` : undefined,
          job.cursor ? sql`(date_trunc('milliseconds', ${emails.createdAt}), ${emails.id}) < (${job.cursor.t}::timestamptz, ${job.cursor.id}::uuid)` : undefined,
        )).orderBy(sql`date_trunc('milliseconds', ${emails.createdAt}) desc`, desc(emails.id)).limit(PAGE_SIZE + 1);
        const page = rows.slice(0, PAGE_SIZE);
        if (job.rowCount + page.length > MAX_EXPORT_ROWS) throw new AppError('validation_error', 'Export exceeds 100,000 emails; narrow the filters');
        const recipients = page.length ? await tx.select().from(emailRecipients).where(inArray(emailRecipients.emailId, page.map((email) => email.id))).orderBy(asc(emailRecipients.id)) : [];
        const lines = page.map((email) => {
          const rcpts = recipients.filter((r) => r.emailId === email.id);
          return [email.id, email.fromAddress, rcpts.filter((r) => r.kind === 'to').map((r) => r.address).join('; '), email.subject,
            aggregateStatus(rcpts.map((r) => r.state as RecipientState)), email.source, email.createdAt.toISOString(), email.scheduledAt?.toISOString() ?? '', email.isTest].map(csvCell).join(',') + '\r\n';
        }).join('');
        await tx.insert(exportChunks).values({ jobId: id, orgId: job.orgId, part: job.chunkCount, csv: (job.chunkCount === 0 ? header : '') + lines });
        const last = page.at(-1);
        const ready = rows.length <= PAGE_SIZE;
        await tx.update(exportJobs).set({ status: ready ? 'ready' : 'queued', rowCount: job.rowCount + page.length, chunkCount: job.chunkCount + 1,
          cursor: last ? { t: last.createdAt.toISOString(), id: last.id } : job.cursor, leaseUntil: null, leaseToken: null, completedAt: ready ? new Date() : null }).where(eq(exportJobs.id, id));
        this.log?.info({ exportId: id, rows: job.rowCount + page.length, ready }, 'export page committed');
      });
    } catch (err) {
      await this.db.update(exportJobs).set({ status: 'failed', error: err instanceof AppError ? err.message : 'Export generation failed; create a new export to retry', leaseUntil: null, leaseToken: null })
        .where(and(eq(exportJobs.id, id), eq(exportJobs.leaseToken, token)));
      this.log?.error({ err, exportId: id }, 'export generation failed');
    }
    return 1;
  }
  async purge(): Promise<number> {
    const chunks = await this.db.execute(sql`delete from export_chunks where (job_id, part) in
      (select c.job_id, c.part from export_chunks c join export_jobs j on j.id = c.job_id where j.expires_at <= now() limit 1000)`);
    const jobs = await this.db.execute(sql`delete from export_jobs where id in (select id from export_jobs where created_at < now() - interval '30 days' limit 1000)`);
    return (chunks.rowCount ?? 0) + (jobs.rowCount ?? 0);
  }
}
