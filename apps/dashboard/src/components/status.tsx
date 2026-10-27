import Lozenge from './controls/Lozenge';
import Tooltip from '@atlaskit/tooltip';

type Appearance = 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success';

interface StateInfo {
  label: string;
  appearance: Appearance;
  help: string;
}

/**
 * Recipient delivery states. Labels never overstate the outcome: remote SMTP
 * acceptance is not inbox placement.
 */
export const RECIPIENT_STATES: Record<string, StateInfo> = {
  QUEUED: { label: 'Queued', appearance: 'inprogress', help: 'Accepted and waiting to be handed to our mail server.' },
  SCHEDULED: { label: 'Scheduled', appearance: 'default', help: 'Will be sent at the scheduled time. You can still cancel it.' },
  DISPATCHING: { label: 'Dispatching', appearance: 'inprogress', help: 'Being handed to our mail server right now.' },
  RETRYING: { label: 'Retrying hand-off', appearance: 'moved', help: 'Our mail server was briefly unavailable; the hand-off will be retried automatically.' },
  MTA_ACCEPTED: { label: 'Handed to mail server', appearance: 'inprogress', help: 'Our mail server has the message and is delivering it to the recipient’s server.' },
  DEFERRED: { label: 'Deferred', appearance: 'moved', help: 'The recipient’s server asked us to try again later (for example greylisting). Delivery is retried automatically.' },
  REMOTE_ACCEPTED: {
    label: 'Accepted by recipient server',
    appearance: 'success',
    help: 'The recipient’s mail server accepted the message. This does not confirm it reached the inbox; the receiver may still filter it.',
  },
  BOUNCED: { label: 'Bounced', appearance: 'removed', help: 'The recipient’s server permanently refused the message. See the SMTP response for the reason.' },
  FAILED: { label: 'Failed', appearance: 'removed', help: 'The message could not be delivered (for example, retries expired or the domain stopped being verified).' },
  REJECTED: { label: 'Rejected', appearance: 'removed', help: 'The message was rejected before sending.' },
  SUPPRESSED: { label: 'Suppressed', appearance: 'default', help: 'Not sent because the address is on your suppression list.' },
  CANCELLED: { label: 'Cancelled', appearance: 'default', help: 'Cancelled before it was handed to the mail server.' },
  DELIVERY_UNKNOWN: {
    label: 'Outcome unknown',
    appearance: 'moved',
    help: 'The hand-off to our mail server was interrupted. We are checking our mail server’s records before retrying, so it is never sent twice.',
  },
  PARTIAL: { label: 'Mixed', appearance: 'moved', help: 'Recipients of this email are in different states. Open the email to see each one.' },
};

export const stateLabel = (state: string) => RECIPIENT_STATES[state]?.label ?? state;

export function StateLozenge({ state, compact = false }: { state: string; compact?: boolean }) {
  const info = RECIPIENT_STATES[state] ?? { label: state, appearance: 'default' as const, help: state };
  return (
    <Tooltip content={info.help} position="top">
      {(props) => (
        <span {...props} tabIndex={0} aria-label={`${info.label}. ${info.help}`}>
          <Lozenge appearance={info.appearance}>{compact && state === 'REMOTE_ACCEPTED' ? 'Server accepted' : compact && state === 'MTA_ACCEPTED' ? 'Handed to server' : info.label}</Lozenge>
        </span>
      )}
    </Tooltip>
  );
}

/** Lozenge with an explanatory tooltip, for any status vocabulary. */
export function HelpLozenge({ label, appearance, help }: { label: string; appearance: Appearance; help: string }) {
  return (
    <Tooltip content={help} position="top">
      {(props) => (
        <span {...props} tabIndex={0} aria-label={`${label}. ${help}`}>
          <Lozenge appearance={appearance}>{label}</Lozenge>
        </span>
      )}
    </Tooltip>
  );
}
