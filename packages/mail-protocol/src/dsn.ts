import { parseSmtpReply, sanitizeSmtpText } from './smtp-status';

/**
 * RFC 3464 delivery-status parsing. Input is the body of the
 * `message/delivery-status` MIME part (per-message fields, blank line,
 * then one block of per-recipient fields per recipient).
 */
export interface DsnRecipient {
  finalRecipient: string | null;
  originalRecipient: string | null;
  action: 'failed' | 'delayed' | 'delivered' | 'relayed' | 'expanded' | null;
  status: string | null;
  remoteMta: string | null;
  smtpCode: number | null;
  diagnostic: string | null;
}

export interface DsnReport {
  reportingMta: string | null;
  envelopeId: string | null;
  recipients: DsnRecipient[];
}

function parseFieldBlock(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  // Unfold continuation lines first.
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    fields.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  }
  return fields;
}

const typed = (v: string | undefined): string | null => {
  if (!v) return null;
  const semi = v.indexOf(';');
  return (semi >= 0 ? v.slice(semi + 1) : v).trim() || null;
};

export function parseDeliveryStatus(body: string): DsnReport {
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const [first, ...rest] = blocks;
  const perMessage = parseFieldBlock(first ?? '');
  const recipients: DsnRecipient[] = [];
  for (const block of rest) {
    const f = parseFieldBlock(block);
    if (!f.has('final-recipient') && !f.has('action')) continue;
    const diagnostic = typed(f.get('diagnostic-code'));
    const action = (f.get('action') ?? '').toLowerCase();
    recipients.push({
      finalRecipient: typed(f.get('final-recipient'))?.toLowerCase() ?? null,
      originalRecipient: typed(f.get('original-recipient'))?.toLowerCase() ?? null,
      action: (['failed', 'delayed', 'delivered', 'relayed', 'expanded'] as const).find((a) => a === action) ?? null,
      status: f.get('status')?.split(/\s/)[0] ?? null,
      remoteMta: typed(f.get('remote-mta')),
      smtpCode: diagnostic ? parseSmtpReply(diagnostic).code : null,
      diagnostic: diagnostic ? sanitizeSmtpText(diagnostic) : null,
    });
  }
  return {
    reportingMta: typed(perMessage.get('reporting-mta')),
    envelopeId: perMessage.get('original-envelope-id') ?? null,
    recipients,
  };
}
