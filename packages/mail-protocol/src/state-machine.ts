/**
 * Recipient-level transport state machine. Engagement (opens, clicks) and
 * complaints are separate events and never change transport state.
 *
 * See docs/architecture/MESSAGE-LIFECYCLE.md for the diagram.
 */
export const RECIPIENT_STATES = [
  'CREATED',
  'VALIDATING',
  'ACCEPTED',
  'SCHEDULED',
  'QUEUED',
  'DISPATCHING',
  'RETRYING',
  'MTA_ACCEPTED',
  'DEFERRED',
  'REMOTE_ACCEPTED',
  'FAILED',
  'BOUNCED',
  'SUPPRESSED',
  'REJECTED',
  'CANCELLED',
  'DELIVERY_UNKNOWN',
] as const;

export type RecipientState = (typeof RECIPIENT_STATES)[number];

/** No further transitions are possible. */
export const TERMINAL_STATES: ReadonlySet<RecipientState> = new Set([
  'FAILED',
  'BOUNCED',
  'SUPPRESSED',
  'REJECTED',
  'CANCELLED',
]);

/**
 * REMOTE_ACCEPTED is final for transport purposes but may still move to
 * BOUNCED if the receiving system later sends an asynchronous DSN.
 */
export const SETTLED_STATES: ReadonlySet<RecipientState> = new Set([...TERMINAL_STATES, 'REMOTE_ACCEPTED']);

/** States the application dispatcher may claim. After MTA_ACCEPTED only Postfix retries. */
export const DISPATCHABLE_STATES = ['QUEUED', 'SCHEDULED', 'RETRYING'] as const satisfies readonly RecipientState[];

const MTA_OUTCOMES: RecipientState[] = ['MTA_ACCEPTED', 'DEFERRED', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED'];

export const TRANSITIONS: Readonly<Record<RecipientState, readonly RecipientState[]>> = {
  CREATED: ['VALIDATING', 'REJECTED'],
  VALIDATING: ['ACCEPTED', 'REJECTED', 'SUPPRESSED'],
  ACCEPTED: ['QUEUED', 'SCHEDULED', 'SUPPRESSED'],
  SCHEDULED: ['QUEUED', 'DISPATCHING', 'CANCELLED'],
  QUEUED: ['DISPATCHING', 'CANCELLED'],
  // The reconciler may observe Postfix outcomes before the dispatcher records MTA_ACCEPTED.
  // SUPPRESSED: the address was suppressed between admission and dispatch (re-checked at claim time).
  DISPATCHING: ['RETRYING', 'DELIVERY_UNKNOWN', 'SUPPRESSED', ...MTA_OUTCOMES],
  RETRYING: ['DISPATCHING', 'FAILED', 'CANCELLED'],
  MTA_ACCEPTED: ['DEFERRED', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED'],
  DEFERRED: ['DEFERRED', 'REMOTE_ACCEPTED', 'BOUNCED', 'FAILED'],
  // Ambiguous hand-off: reconciliation either finds the message in Postfix or proves it never arrived.
  DELIVERY_UNKNOWN: ['RETRYING', ...MTA_OUTCOMES],
  REMOTE_ACCEPTED: ['BOUNCED'],
  FAILED: [],
  BOUNCED: [],
  SUPPRESSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: RecipientState, to: RecipientState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** States from which a transition to `to` is legal; used in guarded UPDATE ... WHERE state IN (...). */
export function sourcesFor(to: RecipientState): RecipientState[] {
  return RECIPIENT_STATES.filter((s) => TRANSITIONS[s].includes(to));
}

/** Customer-facing aggregate status for an email with several recipients. */
export function aggregateStatus(states: RecipientState[]): RecipientState | 'PARTIAL' {
  const unique = [...new Set(states)];
  if (unique.length === 1) return unique[0]!;
  return 'PARTIAL';
}
