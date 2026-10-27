import { auditLogs, type DbOrTx } from '@mp/database';

export interface Actor {
  type: 'user' | 'api_key' | 'smtp_credential' | 'system';
  id: string | null;
}

export interface AuditEntry {
  orgId: string | null;
  actor: Actor;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail. Never include secrets or message content in metadata. */
export async function writeAudit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    orgId: entry.orgId,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ip: entry.ip ?? null,
    requestId: entry.requestId ?? null,
    metadata: entry.metadata ?? {},
  });
}
