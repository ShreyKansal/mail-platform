import { useState, type ReactNode } from 'react';
import Button from './controls/Button';
import IconButton from './controls/IconButton';
import { CodeBlock } from '@atlaskit/code';
import Form from '@atlaskit/form';
import { Copy as CopyIcon } from './icons';
import ModalDialog, { ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import { ApiError } from '../lib/api';
import { errorMessage, useNotify } from './feedback';

/** Copies a value and confirms with a flag. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const notify = useNotify();
  return (
    <IconButton
      spacing="compact"
      appearance="subtle"
      icon={CopyIcon}
      label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          notify.success('Copied to clipboard');
        } catch (err) {
          notify.failure('Could not copy', err);
        }
      }}
    />
  );
}


export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  appearance?: 'danger' | 'warning';
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DetailsDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <ModalTransition><ModalDialog onClose={onClose} width="medium"><ModalHeader hasCloseButton><ModalTitle>{title}</ModalTitle></ModalHeader><ModalBody>{children}</ModalBody><ModalFooter><Button appearance="primary" onClick={onClose}>Close</Button></ModalFooter></ModalDialog></ModalTransition>;
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ title, children, confirmLabel, appearance = 'danger', isLoading, onConfirm, onClose }: ConfirmDialogProps) {
  return (
      <ModalTransition>
      <ModalDialog onClose={onClose} width="small">
        <ModalHeader hasCloseButton>
          <ModalTitle appearance={appearance}>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button appearance={appearance} isLoading={isLoading} isDisabled={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalDialog>
    </ModalTransition>
  );
}

/** Shows a secret exactly once, with copy and a clear warning. */
export function SecretDialog({
  title,
  secrets,
  children,
  onClose,
}: {
  title: string;
  secrets: Array<{ label: string; value: string }>;
  children?: ReactNode;
  onClose: () => void;
}) {
  return (
      <ModalTransition>
      <ModalDialog onClose={onClose} width="medium" shouldCloseOnOverlayClick={false}>
        <ModalHeader hasCloseButton>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.200">
            <SectionMessage appearance="warning" title="Copy this now">
              <Text as="p">It is shown only once. We store only a hash and can’t show it again.</Text>
            </SectionMessage>
            {secrets.map((s) => (
              <Stack key={s.label} space="space.050">
                <Inline spread="space-between" alignBlock="center">
                  <Text weight="semibold">{s.label}</Text>
                  <CopyButton value={s.value} label={`Copy ${s.label.toLowerCase()}`} />
                </Inline>
                <Box>
                  <CodeBlock text={s.value} language="text" showLineNumbers={false} shouldWrapLongLines />
                </Box>
              </Stack>
            ))}
            {children}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="primary" onClick={onClose}>
            Done
          </Button>
        </ModalFooter>
      </ModalDialog>
    </ModalTransition>
  );
}

/** Maps API validation details onto form field names (e.g. "to[0]" → "to"). */
export function fieldErrorsFrom(err: unknown, fields: string[]): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const d of err.body.details ?? []) {
    if (!d.path) continue;
    const root = d.path.replace(/^\[\d+\]\./, '').split(/[.[]/)[0] ?? '';
    if (fields.includes(root) && !out[root]) out[root] = d.message;
  }
  return out;
}

export interface FormDialogProps<V extends Record<string, any>> {
  title: string;
  submitLabel: string;
  /** Field names, used to place server-side validation errors next to the right field. */
  fields: string[];
  onSubmit: (values: V) => Promise<void>;
  onClose: () => void;
  children: ReactNode;
  width?: 'small' | 'medium' | 'large';
}

/**
 * Modal form built on @atlaskit/form. Server-side validation details are shown
 * on their fields; any other error appears as a message at the top.
 */
export function FormDialog<V extends Record<string, any>>({ title, submitLabel, fields, onSubmit, onClose, children, width = 'medium' }: FormDialogProps<V>) {
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
      <ModalTransition>
      <ModalDialog onClose={() => { if (!busy) onClose(); }} width={width} shouldScrollInViewport shouldCloseOnOverlayClick={!busy} shouldCloseOnEscapePress={!busy}>
        <Form<V>
          onSubmit={async (values) => {
            setFormError(null);
            setBusy(true);
            try {
              await onSubmit(values);
              return undefined;
            } catch (err) {
              const fieldErrors = fieldErrorsFrom(err, fields);
              if (Object.keys(fieldErrors).length === 0) setFormError(errorMessage(err));
              return fieldErrors;
            } finally {
              setBusy(false);
            }
          }}
        >
          {({ formProps, submitting }) => (
            <form {...formProps} noValidate>
              <ModalHeader hasCloseButton={!submitting}>
                <ModalTitle>{title}</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.100">
                  {formError && (
                    <SectionMessage appearance="error">
                      <Text as="p">{formError}</Text>
                    </SectionMessage>
                  )}
                  {children}
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={onClose} isDisabled={submitting}>
                  Cancel
                </Button>
                <Button appearance="primary" type="submit" isLoading={submitting} isDisabled={submitting}>
                  {submitLabel}
                </Button>
              </ModalFooter>
            </form>
          )}
        </Form>
      </ModalDialog>
    </ModalTransition>
  );
}
