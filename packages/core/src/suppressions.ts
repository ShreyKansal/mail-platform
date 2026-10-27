import { and, eq, inArray, suppressions, type DbOrTx } from '@mp/database';

export type SuppressionReason = (typeof suppressions.$inferInsert)['reason'];

/** Returns the subset of `addressesLower` suppressed for the tenant. */
export async function findSuppressed(tx: DbOrTx, orgId: string, addressesLower: string[]): Promise<Set<string>> {
  if (addressesLower.length === 0) return new Set();
  const rows = await tx
    .select({ a: suppressions.addressLower })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), inArray(suppressions.addressLower, addressesLower)));
  return new Set(rows.map((r) => r.a));
}

/** Idempotent: an existing suppression keeps its original reason and timestamp. */
export async function suppress(
  tx: DbOrTx,
  input: { orgId: string; address: string; reason: SuppressionReason; detail?: string | null; sourceRecipientId?: string | null },
): Promise<boolean> {
  const rows = await tx
    .insert(suppressions)
    .values({
      orgId: input.orgId,
      addressLower: input.address.toLowerCase(),
      reason: input.reason,
      detail: input.detail ?? null,
      sourceRecipientId: input.sourceRecipientId ?? null,
    })
    .onConflictDoNothing({ target: [suppressions.orgId, suppressions.addressLower] })
    .returning({ id: suppressions.id });
  return rows.length > 0;
}
