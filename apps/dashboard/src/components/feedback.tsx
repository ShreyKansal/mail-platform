import { useCallback } from 'react';
import { useFlags } from '@atlaskit/flag';
import { CircleAlert as StatusErrorIcon } from './icons';
import { CheckCircle as StatusSuccessIcon } from './icons';
import { CircleAlert, RotateCw } from './icons';
import Button from './controls/Button';
import { token } from '@atlaskit/tokens';
import { ApiError } from '../lib/api';

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/** Auto-dismissing success / error flags (Atlassian "flag" toasts) for mutations. */
export function useNotify() {
  const { showFlag } = useFlags();
  const success = useCallback(
    (title: string, description?: string) =>
      showFlag({
        title,
        description,
        appearance: 'normal',
        icon: <StatusSuccessIcon label="Success" color={token('color.icon.success')} />,
        isAutoDismiss: true,
      }),
    [showFlag],
  );
  const failure = useCallback(
    (title: string, err?: unknown) =>
      showFlag({
        title,
        description: err === undefined ? undefined : errorMessage(err),
        appearance: 'normal',
        icon: <StatusErrorIcon label="Error" color={token('color.icon.danger')} />,
        isAutoDismiss: true,
      }),
    [showFlag],
  );
  return { success, failure };
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="product-loading" role="status" aria-live="polite" aria-label={label}>
      <span className="product-loading-label">{label}…</span>
      <div className="product-loading-lines" aria-hidden="true"><span /><span /><span /></div>
    </div>
  );
}

export function ErrorBlock({ error, onRetry, title = 'Unable to load data' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <div className="product-error" role="alert">
      <span className="product-error-icon" aria-hidden="true"><CircleAlert size={22} /></span>
      <div className="product-error-content"><p className="product-error-title">{title}</p>
        <p className="product-error-message">{errorMessage(error)}</p>
        {requestId && <details className="product-error-details"><summary>Request details</summary><p>Request ID: <code>{requestId}</code></p></details>}
        {onRetry && <Button onClick={onRetry}><RotateCw size={15} aria-hidden="true" />Try again</Button>}
      </div>
    </div>
  );
}
