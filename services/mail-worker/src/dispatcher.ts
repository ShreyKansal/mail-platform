import { findSuppressed, loadSendingIdentity, transitionRecipient, type CoreConfig, type SendingIdentity } from '@mp/core';
import {
  emailAttachments,
  apiKeys,
  and,
  emailContents,
  emailDeliveryAttempts,
  emailRecipients,
  emails,
  eq,
  organizations,
  sql,
  workerCheckpoints,
  type Db,
} from '@mp/database';
import { composeSignedMessage, encodeVerp, queueIdFromReply, sanitizeSmtpText } from '@mp/mail-protocol';
import { metrics } from '@mp/observability';
import type { Logger } from '@mp/shared';
import { backoffMs, classifySubmissionError, type MtaClient } from './mta';

export interface DispatcherOptions {
  workerId: string;
  streams: Array<'transactional' | 'marketing'>;
  batchSize: number;
  leaseSeconds: number;
  maxSubmissionAttempts: number;
  reconcileGraceSeconds: number;
}

type Claimed = {
  id: string;
  org_id: string;
  email_id: string;
  address: string;
  submission_attempts: number;
};

const POSTFIX_CHECKPOINT = 'postfix-log';

export class Dispatcher {
  constructor(
    private readonly db: Db,
    private readonly core: CoreConfig,
    private readonly mta: MtaClient,
    private readonly opts: DispatcherOptions,
    private readonly log: Logger,
    private readonly enforcedTlsMta?: MtaClient,
  ) {}

  /** Claims and dispatches one batch. Returns the number of recipients processed. */
  async tick(): Promise<number> {
    await this.db.execute(sql`update email_recipients r set state = 'RETRYING', lease_owner = null, lease_expires_at = null, next_attempt_at = now()
      from emails e where r.email_id = e.id and e.is_test = true and r.state = 'DISPATCHING' and r.lease_expires_at < now()`);
    const resolved = await this.db.transaction(async (tx) => {
      const due = await tx.execute<{ id: string }>(sql`select r.id from email_recipients r join emails e on e.id = r.email_id
        where e.is_test = true and r.state = 'DEFERRED' and r.next_attempt_at <= now() order by r.id limit 100 for update of r skip locked`);
      for (const row of due.rows) await transitionRecipient(tx, { recipientId: row.id, to: 'REMOTE_ACCEPTED', cause: 'simulated-defer-recovery', occurredAt: new Date(), patch: { lastSmtpCode: 250, lastResponse: 'Simulated acceptance after deferral' }, eventData: { test_mode: true } });
      return due.rows.length;
    });
    const claimed = await this.claim();
    if (claimed.length === 0) return resolved;

    const heartbeat = setInterval(() => {
      void this.extendLeases(claimed.map((c) => c.id)).catch((err) => this.log.warn({ err }, 'lease heartbeat failed'));
    }, (this.opts.leaseSeconds * 1000) / 4);
    try {
      const byEmail = new Map<string, Claimed[]>();
      for (const c of claimed) byEmail.set(c.email_id, [...(byEmail.get(c.email_id) ?? []), c]);
      for (const [emailId, recipients] of byEmail) {
        await this.dispatchEmail(emailId, recipients);
      }
    } finally {
      clearInterval(heartbeat);
    }
    return claimed.length;
  }

  private async claim(): Promise<Claimed[]> {
    const res = await this.db.execute<Claimed>(sql`
      update email_recipients
         set state = 'DISPATCHING',
             lease_owner = ${this.opts.workerId},
             lease_expires_at = now() + make_interval(secs => ${this.opts.leaseSeconds}),
             submission_attempts = submission_attempts + 1,
             state_changed_at = now()
       where id in (
         select id from email_recipients
          where state in ('QUEUED', 'SCHEDULED', 'RETRYING')
            and next_attempt_at <= now()
            and not exists(select 1 from automation_steps ast join automation_runs ar on ar.id=ast.run_id join automations a on a.id=ar.automation_id where ast.email_id=email_recipients.email_id and a.status='paused' and ar.status not in ('cancelled','skipped'))
            and stream = any(${`{${this.opts.streams.join(',')}}`}::email_stream[])
          order by next_attempt_at
          limit ${this.opts.batchSize}
          for update skip locked)
      returning id, org_id, email_id, address, submission_attempts`);
    return res.rows;
  }

  private async extendLeases(ids: string[]): Promise<void> {
    await this.db.execute(sql`
      update email_recipients
         set lease_expires_at = now() + make_interval(secs => ${this.opts.leaseSeconds})
       where id = any(${`{${ids.join(',')}}`}::uuid[]) and lease_owner = ${this.opts.workerId} and state = 'DISPATCHING'`);
  }

  private async holdPausedAutomation(r:Claimed):Promise<boolean> {
    const result=await this.db.execute(sql`update email_recipients er set state='RETRYING',lease_owner=null,lease_expires_at=null,submission_attempts=greatest(0,submission_attempts-1),next_attempt_at=now()
      where er.id=${r.id}::uuid and er.state='DISPATCHING' and er.lease_owner=${this.opts.workerId}
      and exists(select 1 from automation_steps ast join automation_runs ar on ar.id=ast.run_id join automations a on a.id=ar.automation_id where ast.email_id=er.email_id and a.status='paused' and ar.status not in ('cancelled','skipped')) returning er.id`);
    return result.rows.length>0;
  }

  private async marketingEligible(emailId:string,orgId:string,projectId:string):Promise<boolean> {
    const result=await this.db.execute(sql`select 1 from broadcast_recipients br
      join broadcasts b on b.id=br.broadcast_id join contacts c on c.id=br.contact_id
      where br.email_id=${emailId}::uuid and br.org_id=${orgId}::uuid and br.project_id=${projectId}::uuid
      and b.org_id=${orgId}::uuid and b.project_id=${projectId}::uuid and b.status<>'cancelled'
      and c.org_id=${orgId}::uuid and c.project_id=${projectId}::uuid and c.unsubscribed=false and c.archived_at is null
      and c.email_lower=lower(br.email)
      union all
      select 1 from automation_steps ast join automation_runs ar on ar.id=ast.run_id join contacts c on c.id=ar.contact_id
      join automation_versions av on av.automation_id=ar.automation_id and av.version=ar.version
      where ast.email_id=${emailId}::uuid and ast.org_id=${orgId}::uuid and ast.project_id=${projectId}::uuid
      and ar.org_id=${orgId}::uuid and ar.project_id=${projectId}::uuid and ar.status not in ('cancelled','skipped')
      and (av.sender->>'type'<>'api_key' or exists(select 1 from api_keys k where k.id=(av.sender->>'id')::uuid and k.org_id=ar.org_id and k.project_id=ar.project_id and k.revoked_at is null and (k.expires_at is null or k.expires_at>now())))
      and c.org_id=${orgId}::uuid and c.project_id=${projectId}::uuid and c.unsubscribed=false and c.archived_at is null
      and c.email_lower=lower(ar.email) limit 1`);
    return result.rows.length>0;
  }

  private async suppressMarketing(r:Claimed):Promise<void> {
    await this.db.transaction(tx=>transitionRecipient(tx,{recipientId:r.id,to:'SUPPRESSED',cause:'broadcast-consent-check',occurredAt:new Date(),patch:{leaseOwner:null,leaseExpiresAt:null},eventData:{reason:'Run or campaign cancelled, or contact no longer subscribed.'}}));
  }

  private async fail(r: Claimed, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
    await this.db.transaction((tx) =>
      transitionRecipient(tx, {
        recipientId: r.id,
        to: 'FAILED',
        patch: { leaseOwner: null, leaseExpiresAt: null, lastResponse: reason, bounceClass: 'platform_policy' },
        cause: `dispatch-fail:${r.submission_attempts}`,
        occurredAt: new Date(),
        eventData: { reason, ...extra },
      }),
    );
  }

  private async dispatchEmail(emailId: string, recipients: Claimed[]): Promise<void> {
    const [email] = await this.db.select().from(emails).where(eq(emails.id, emailId));
    if (!email) return;

    if (email.stream === 'marketing' && !(await this.marketingEligible(emailId,email.orgId,email.projectId))) {
      for (const r of recipients) await this.suppressMarketing(r);
      return;
    }

    const [org] = await this.db.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, email.orgId));
    if (org?.status !== 'active') {
      for (const r of recipients) await this.fail(r, 'organization is not permitted to send');
      return;
    }
    if (email.scheduledAt && email.apiKeyId) {
      const [key] = await this.db.select().from(apiKeys).where(and(eq(apiKeys.id, email.apiKeyId), eq(apiKeys.orgId, email.orgId), eq(apiKeys.projectId, email.projectId)));
      if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) {
        for (const r of recipients) await this.fail(r, 'API key used to schedule this email is no longer active');
        return;
      }
    }

    // Suppressions may have been added since admission (e.g. a hard bounce from another email).
    const suppressed = email.isTest ? new Set<string>() : await findSuppressed(this.db, email.orgId, recipients.map((r) => r.address.toLowerCase()));
    const sendable: Claimed[] = [];
    for (const r of recipients) {
      if (!suppressed.has(r.address.toLowerCase())) {
        sendable.push(r);
        continue;
      }
      await this.db.transaction((tx) =>
        transitionRecipient(tx, {
          recipientId: r.id,
          to: 'SUPPRESSED',
          patch: { leaseOwner: null, leaseExpiresAt: null },
          cause: 'dispatch-check',
          occurredAt: new Date(),
          eventData: { reason: 'address was suppressed after the email was accepted' },
        }),
      );
    }
    if (sendable.length === 0) return;

    let identity: SendingIdentity;
    let raw: Buffer;
    try {
      identity = await loadSendingIdentity(this.db, this.core, email.domainId);
      if (!email.isTest && identity.domain.tlsPolicy === 'enforced' && !this.enforcedTlsMta) {
        for (const r of sendable) await this.fail(r, 'enforced TLS transport is not configured');
        return;
      }
      if (!identity.domain.sendingEnabled) {
        for (const r of sendable) await this.fail(r, `sending is disabled for ${identity.domain.name} (DNS verification lost)`);
        return;
      }
      if (email.isTest) {
        for (const recipient of sendable) await this.simulate(recipient);
        return;
      }
      const [content] = await this.db.select().from(emailContents).where(eq(emailContents.emailId, emailId));
      const attachments = await this.db.select().from(emailAttachments).where(eq(emailAttachments.emailId, emailId));
      raw = await composeSignedMessage({
        from: email.fromName ? { address: email.fromAddress, name: email.fromName } : { address: email.fromAddress },
        to: content?.toHeader ?? [],
        cc: content?.ccHeader ?? [],
        replyTo: content?.replyTo ?? [],
        subject: email.subject,
        html: content?.html,
        text: content?.text,
        headers: content?.headers ?? {},
        attachments: attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.contentBase64, 'base64'), contentId: a.contentId })),
        messageId: email.messageId,
        date: email.createdAt,
        platformHeaders: {
          'Feedback-ID': `${email.id.slice(0, 8)}:${email.orgId.slice(0, 8)}:${email.stream}:mp`,
          'X-MP-Email-Id': email.id,
        },
        dkim: { domain: identity.domain.name, selector: identity.dkim.selector, privateKeyPem: identity.dkim.privateKeyPem },
      });
    } catch (err) {
      metrics.dkimSigningFailures.inc();
      this.log.error({ err, emailId }, 'message composition or signing failed');
      for (const r of sendable) await this.fail(r, 'message could not be composed or signed');
      return;
    }

    for (const r of sendable) {
      await this.submitOne(r, raw, identity, email.createdAt, email.stream);
    }
  }

  private async submitOne(r: Claimed, raw: Buffer, identity: SendingIdentity, admittedAt: Date, stream: string): Promise<void> {
    if (stream === 'marketing' && await this.holdPausedAutomation(r)) return;
    if (stream === 'marketing' && !(await this.marketingEligible(r.email_id, r.org_id, identity.domain.projectId))) {
      await this.suppressMarketing(r);
      return;
    }
    const envelopeFrom = encodeVerp(r.id, identity.returnPathDomain, this.core.verpSecret);
    const startedAt = new Date();
    try {
      const mta = identity.domain.tlsPolicy === 'enforced' ? this.enforcedTlsMta! : this.mta;
      const { response } = await mta.submit({ from: envelopeFrom, to: r.address }, raw);
      const queueId = queueIdFromReply(response);
      await this.db.transaction(async (tx) => {
        await tx.insert(emailDeliveryAttempts).values({
          orgId: r.org_id,
          recipientId: r.id,
          stage: 'submission',
          outcome: 'mta_accepted',
          mtaQueueId: queueId,
          response: sanitizeSmtpText(response),
          occurredAt: startedAt,
        });
        await transitionRecipient(tx, {
          recipientId: r.id,
          to: 'MTA_ACCEPTED',
          patch: { mtaQueueId: queueId, leaseOwner: null, leaseExpiresAt: null },
          cause: `submit:${r.submission_attempts}`,
          occurredAt: new Date(),
          eventData: { mta_queue_id: queueId },
        });
      });
      metrics.emailQueued.inc({ stream });
      metrics.dispatchLatency.observe((Date.now() - admittedAt.getTime()) / 1000);
    } catch (err) {
      const outcome = classifySubmissionError(err);
      const e = err as { responseCode?: number; response?: string; message?: string; code?: string };
      const response = sanitizeSmtpText(e.response ?? e.message ?? 'unknown error');
      if (outcome === 'retry' && !e.responseCode) metrics.smtpConnectionFailures.inc();
      this.log.warn({ recipientId: r.id, outcome, code: e.code, smtpCode: e.responseCode }, 'MTA hand-off failed');

      await this.db.transaction(async (tx) => {
        await tx.insert(emailDeliveryAttempts).values({
          orgId: r.org_id,
          recipientId: r.id,
          stage: 'submission',
          outcome: `submission_${outcome}`,
          smtpCode: e.responseCode ?? null,
          response,
          occurredAt: startedAt,
        });
        const base = { recipientId: r.id, cause: `submit:${r.submission_attempts}`, occurredAt: new Date() };
        const cleared = { leaseOwner: null, leaseExpiresAt: null, lastSmtpCode: e.responseCode ?? null, lastResponse: response };
        if (outcome === 'permanent' || (outcome === 'retry' && r.submission_attempts >= this.opts.maxSubmissionAttempts)) {
          await transitionRecipient(tx, { ...base, to: 'FAILED', patch: { ...cleared, bounceClass: 'mta_rejected' }, eventData: { reason: response } });
        } else if (outcome === 'retry') {
          await transitionRecipient(tx, {
            ...base,
            to: 'RETRYING',
            patch: { ...cleared, nextAttemptAt: new Date(Date.now() + backoffMs(r.submission_attempts)) },
          });
        } else {
          await transitionRecipient(tx, { ...base, to: 'DELIVERY_UNKNOWN', patch: cleared, eventData: { reason: 'hand-off interrupted after DATA; reconciling with MTA log' } });
        }
      });
    }
  }

  private async simulate(recipient: Claimed): Promise<void> {
    const scenario = recipient.address.toLowerCase().split('@')[0];
    // Defense in depth: never let corrupted test-mode data reach an MTA.
    if (!['success', 'defer', 'bounce', 'suppress'].includes(scenario!) || !recipient.address.toLowerCase().endsWith('@simulate.mail-platform.invalid')) {
      await this.fail(recipient, 'invalid simulator address'); return;
    }
    await this.db.transaction(async (tx) => {
      const [owned] = await tx.select({ id: emailRecipients.id }).from(emailRecipients).where(and(eq(emailRecipients.id, recipient.id), eq(emailRecipients.state, 'DISPATCHING'), eq(emailRecipients.leaseOwner, this.opts.workerId), eq(emailRecipients.submissionAttempts, recipient.submission_attempts))).for('update');
      if (!owned) return;
      const base = { recipientId: recipient.id, cause: `simulated:${recipient.submission_attempts}`, occurredAt: new Date(), eventData: { test_mode: true } };
      const clear = { leaseOwner: null, leaseExpiresAt: null };
      if (scenario === 'suppress') {
        await transitionRecipient(tx, { ...base, to: 'SUPPRESSED', patch: clear }); return;
      }
      await tx.insert(emailDeliveryAttempts).values({ orgId: recipient.org_id, recipientId: recipient.id, stage: 'submission', outcome: 'simulated', response: 'Test mode: no MTA hand-off', occurredAt: new Date() });
      await transitionRecipient(tx, { ...base, to: 'MTA_ACCEPTED', patch: clear });
      if (scenario === 'bounce') {
        await transitionRecipient(tx, { ...base, to: 'BOUNCED', patch: { lastSmtpCode: 550, lastEnhancedStatus: '5.1.1', lastResponse: 'Simulated nonexistent mailbox', bounceClass: 'hard' } });
      } else if (scenario === 'defer') {
        await transitionRecipient(tx, { ...base, to: 'DEFERRED', patch: { nextAttemptAt: new Date(), lastSmtpCode: 451, lastEnhancedStatus: '4.7.1', lastResponse: 'Simulated temporary failure' } });
      } else {
        await transitionRecipient(tx, { ...base, to: 'REMOTE_ACCEPTED', patch: { lastSmtpCode: 250, lastEnhancedStatus: '2.0.0', lastResponse: 'Simulated remote acceptance' } });
      }
    });
  }

  /**
   * Resolves recipients whose hand-off outcome is unknown: expired DISPATCHING
   * leases (worker crashed) and DELIVERY_UNKNOWN. If the Postfix log shows the
   * message was queued, it is marked MTA_ACCEPTED. If the log reconciler has
   * processed well past the moment of uncertainty without seeing it, Postfix
   * never queued it and re-dispatch is safe. Otherwise we keep waiting.
   */
  async reconcileUncertain(): Promise<number> {
    const [checkpoint] = await this.db.select().from(workerCheckpoints).where(eq(workerCheckpoints.name, POSTFIX_CHECKPOINT));
    const watermark = checkpoint?.watermarkAt ?? null;
    const heartbeatFresh = checkpoint ? Date.now() - checkpoint.heartbeatAt.getTime() < 60_000 : false;

    const res = await this.db.execute<{ id: string; state: string; since: Date; queue_id: string | null }>(sql`
      select r.id, r.state, coalesce(r.lease_expires_at, r.state_changed_at) as since, q.queue_id
        from email_recipients r
        left join mta_queue_messages q on q.recipient_id = r.id
       where (r.state = 'DISPATCHING' and r.lease_expires_at < now())
          or (r.state = 'DELIVERY_UNKNOWN')
       limit 200`);

    let resolved = 0;
    for (const row of res.rows) {
      const since = new Date(row.since);
      if (row.queue_id) {
        await this.db.transaction((tx) =>
          transitionRecipient(tx, {
            recipientId: row.id,
            to: 'MTA_ACCEPTED',
            patch: { mtaQueueId: row.queue_id, leaseOwner: null, leaseExpiresAt: null },
            cause: `reconcile:${row.queue_id}`,
            occurredAt: new Date(),
            eventData: { mta_queue_id: row.queue_id, reconciled: true },
          }),
        );
        resolved += 1;
        continue;
      }
      const provenAbsent = heartbeatFresh && watermark !== null && watermark.getTime() > since.getTime() + this.opts.reconcileGraceSeconds * 1000;
      if (!provenAbsent) continue;
      if (row.state === 'DISPATCHING') {
        // Crash before or during hand-off with no trace in Postfix: retry. DISPATCHING -> RETRYING.
        await this.db.transaction((tx) =>
          transitionRecipient(tx, {
            recipientId: row.id,
            to: 'RETRYING',
            patch: { leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date() },
            cause: `lease-expired:${since.toISOString()}`,
            occurredAt: new Date(),
          }),
        );
      } else {
        await this.db.transaction((tx) =>
          transitionRecipient(tx, {
            recipientId: row.id,
            to: 'RETRYING',
            patch: { nextAttemptAt: new Date() },
            cause: `unknown-resolved:${since.toISOString()}`,
            occurredAt: new Date(),
          }),
        );
      }
      resolved += 1;
    }
    return resolved;
  }

  /** Deletes expired idempotency keys in small batches (keys are valid for 24 hours). */
  async purgeExpiredIdempotencyKeys(): Promise<number> {
    const res = await this.db.execute(sql`
      delete from email_idempotency_keys
       where ctid in (select ctid from email_idempotency_keys where expires_at < now() limit 1000)`);
    return res.rowCount ?? 0;
  }

  /** Bounded retention for temporary bearer links and request metadata. */
  async purgeOperationalData(): Promise<number> {
    const shares = await this.db.execute(sql`delete from email_shares where id in (select id from email_shares where expires_at <= now() limit 1000)`);
    const logs = await this.db.execute(sql`delete from api_request_logs where id in (select id from api_request_logs where created_at < now() - interval '30 days' limit 1000)`);
    return (shares.rowCount ?? 0) + (logs.rowCount ?? 0);
  }

  async reportQueueMetrics(): Promise<void> {
    const res = await this.db.execute<{ stream: string; depth: number; oldest: number | null }>(sql`
      select stream, count(*)::int as depth, extract(epoch from now() - min(next_attempt_at))::float8 as oldest
        from email_recipients
       where state in ('QUEUED', 'SCHEDULED', 'RETRYING') and next_attempt_at <= now()
       group by stream`);
    for (const s of ['transactional', 'marketing']) {
      const row = res.rows.find((r) => r.stream === s);
      metrics.queueDepth.set({ stream: s }, row?.depth ?? 0);
      metrics.queueOldestAge.set({ stream: s }, row?.oldest ?? 0);
    }
  }
}
