import { useState, type ReactNode } from 'react';
import Avatar from '@atlaskit/avatar';
import Badge from '@atlaskit/badge';
import Button from '@atlaskit/button/default/button';
import IconButton from '@atlaskit/button/icon/button';
import LinkButton from '@atlaskit/button/link';
import Checkbox from '@atlaskit/checkbox';
import { CodeBlock } from '@atlaskit/code';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from '@atlaskit/dropdown-menu';
import EmptyState from '@atlaskit/empty-state';
import { Label } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import AddIcon from '@atlaskit/icon/core/add';
import Lozenge from '@atlaskit/lozenge';
import { Inline, Stack, Text } from '@atlaskit/primitives/compiled';
import Select from '@atlaskit/select';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
import TextArea from '@atlaskit/textarea';
import Textfield from '@atlaskit/textfield';
import Tooltip from '@atlaskit/tooltip';
import { ConfirmDialog, DetailsDialog } from '../components/dialogs';
import { useNotify } from '../components/feedback';
import { Page, TabBody } from '../components/Page';
import { StateLozenge } from '../components/status';
import { Table } from '../components/Table';

function Sample({ title, rule, children }: { title: string; rule: string; children: ReactNode }) {
  return <section className="component-sample"><Stack space="space.200"><Heading size="small" as="h2">{title}</Heading><Text color="color.text.subtle">{rule}</Text><div>{children}</div></Stack></section>;
}

/** Development-only rendering reference. These examples use real installed packages, never screenshots or CSS replicas. */
export default function ComponentReference() {
  const [selected, setSelected] = useState(false), [modal, setModal] = useState<'details' | 'confirm' | null>(null);
  const [sender, setSender] = useState('hello@example.com');
  const [source, setSource] = useState('api');
  const notify = useNotify();
  return <Page title="Atlaskit component reference" crumbs={[{ text: 'Component reference' }]} description="Live examples of the installed components and their interaction states. Development only; no example sends email or changes account data." actions={<LinkButton href="https://atlassian.design/components" target="_blank">Official component catalog</LinkButton>}>
    <SectionMessage title="Compare actual components before changing app styles" appearance="information"><Text>Theme changes are available in your account menu. These samples retain Atlaskit typography, spacing, borders and interaction styles. App CSS styles only the surrounding sample containers.</Text></SectionMessage>
    <div className="component-samples">
      <Sample title="Buttons & actions" rule="Primary for the main task; secondary for supporting actions; links for destinations.">
        <Stack space="space.200"><Inline space="space.100" shouldWrap><Button appearance="primary" onClick={() => notify.success('Primary action works')}>Primary action</Button><Button>Default</Button><Button appearance="subtle">Subtle</Button><LinkButton href="/emails">Go to Emails</LinkButton></Inline><Inline space="space.100" shouldWrap><Button appearance="danger" onClick={() => setModal('confirm')}>Destructive action</Button><Button isDisabled>Disabled</Button><Button isLoading>Loading</Button><Tooltip content="Add a resource"><IconButton icon={AddIcon} label="Add resource" onClick={() => setModal('details')} /></Tooltip></Inline></Stack>
      </Sample>
      <Sample title="Form controls" rule="Visible labels, real input state, associated helper text and no CSS restyling of control internals.">
        <Stack space="space.200"><div><Label htmlFor="reference-sender">Sender address</Label><Textfield id="reference-sender" type="email" value={sender} onChange={event => setSender(event.currentTarget.value)} /></div><div><Label htmlFor="reference-disabled">Disabled field</Label><Textfield id="reference-disabled" value="Managed by your organization" isDisabled /></div><div><Label htmlFor="reference-source">Source</Label><Select inputId="reference-source" options={[{ label: 'API', value: 'api' }, { label: 'SMTP', value: 'smtp' }]} value={{ label: source.toUpperCase(), value: source }} onChange={option => setSource(option?.value ?? 'api')} /></div><div><Label htmlFor="reference-message">Message</Label><TextArea id="reference-message" placeholder="Write a message…" minimumRows={3} /></div><Checkbox label="Include archived resources" isChecked={selected} onChange={event => setSelected(event.target.checked)} /></Stack>
      </Sample>
      <Sample title="Statuses & identity" rule="Status uses text as well as color. An avatar identifies an entity; a badge shows a count.">
        <Stack space="space.200"><Inline space="space.100" shouldWrap>{['QUEUED', 'REMOTE_ACCEPTED', 'BOUNCED', 'SUPPRESSED'].map(state => <StateLozenge key={state} state={state} />)}</Inline><Inline space="space.200" alignBlock="center"><Avatar name="Alex Morgan" /><Text>Alex Morgan</Text><Badge>{4}</Badge><Lozenge appearance="inprogress">Owner</Lozenge></Inline></Stack>
      </Sample>
      <Sample title="Menus, tabs & overlays" rule="Menus hold actions; tabs group views; modals contain a focused task and restore focus when closed.">
        <Stack space="space.200"><Inline space="space.100" shouldWrap><DropdownMenu trigger="Actions"><DropdownItemGroup><DropdownItem onClick={() => setModal('details')}>View details</DropdownItem><DropdownItem onClick={() => notify.success('Copied example')}>Example action</DropdownItem></DropdownItemGroup></DropdownMenu><Button onClick={() => setModal('details')}>Open dialog</Button></Inline><Tabs id="reference-tabs"><TabList><Tab>Details</Tab><Tab>Activity</Tab></TabList><TabPanel><TabBody><Text>Details panel with standard tab spacing.</Text></TabBody></TabPanel><TabPanel><TabBody><Text>Activity panel. Keyboard arrow navigation is provided by Atlaskit.</Text></TabBody></TabPanel></Tabs></Stack>
      </Sample>
      <Sample title="Feedback & loading" rule="Use the correct semantic appearance. Preserve context and explain recovery.">
        <Stack space="space.200"><SectionMessage appearance="success" title="Changes saved"><Text>The example completed successfully.</Text></SectionMessage><SectionMessage appearance="warning" title="Action required"><Text>Verify your domain before sending.</Text></SectionMessage><SectionMessage appearance="error" title="Could not save"><Text>Your input is retained. Try again.</Text></SectionMessage><Inline space="space.100" alignBlock="center"><Spinner label="Loading example" size="small" /><Text>Loading activity…</Text></Inline><Button onClick={() => notify.success('Saved', 'This is a real Atlaskit flag.')}>Show success flag</Button></Stack>
      </Sample>
      <Sample title="Empty state" rule="Explain why content is empty and provide a relevant next action."><EmptyState header="No domains yet" description="Add a domain to start setting up your sending identity." primaryAction={<Button appearance="primary" onClick={() => setModal('details')}>Add domain example</Button>} /></Sample>
    </div>
    <Sample title="Dynamic table" rule="The table owns cell typography and padding. The shared wrapper provides local scrolling and server cursor controls."><Table label="Component reference resources" isLoading={false} columns={[{ key: 'name', content: 'Domain', isSortable: true }, { key: 'status', content: 'Status' }, { key: 'activity', content: 'Activity' }]} rows={[{ key: 'one', cells: [{ content: 'notifications.example.com', sortValue: 'notifications' }, { content: <Lozenge appearance="success">Verified</Lozenge> }, { content: '84 accepted by recipient servers' }] }, { key: 'two', cells: [{ content: 'mail.example.com', sortValue: 'mail' }, { content: <Lozenge appearance="inprogress">Pending</Lozenge> }, { content: 'Waiting for DNS' }] }]} emptyView={<Text>No resources.</Text>} /></Sample>
    <Sample title="Implementation" rule="Import supported public entry points and render the real component; keep project styles on outer containers."><CodeBlock language="tsx" showLineNumbers={false} text={'import Button from \'@atlaskit/button/default/button\';\n\n<Button appearance="primary" onClick={save}>Save changes</Button>'} /></Sample>
    {modal === 'details' && <DetailsDialog title="Example dialog" onClose={() => setModal(null)}><Text>This is the actual installed Atlaskit ModalDialog. Close it with the button, close control or Escape.</Text></DetailsDialog>}
    {modal === 'confirm' && <ConfirmDialog title="Confirm example action?" confirmLabel="Confirm example" onClose={() => setModal(null)} onConfirm={() => { setModal(null); notify.success('Example confirmed'); }}><Text>This sample does not modify data. Initial keyboard focus belongs on Cancel.</Text></ConfirmDialog>}
  </Page>;
}
