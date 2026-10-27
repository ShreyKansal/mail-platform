import LinkButton from '../components/controls/LinkButton';
import { EmptyState } from '../components/EmptyState';
import { Page } from '../components/Page';

export function NotFoundPage() {
  return <Page title="Page not found" crumbs={[{text:'Page not found'}]}>
    <EmptyState header="Page not found" description="The page may have moved, or you may not have access to it." primaryAction={<LinkButton href="/">Go to Overview</LinkButton>} />
  </Page>;
}
