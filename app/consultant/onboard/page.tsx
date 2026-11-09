import { pageViewer } from '@/server/page-auth';
import { PageHeader } from '@/components/ui';
import { OnboardClient } from '@/components/onboard-client';
import { issuer } from '@/server/connectors/oauth';

export default async function Onboard() {
  await pageViewer('consultant');
  return (
    <>
      <PageHeader title="" back={{ href: '/consultant/home', label: 'Work queue' }} />
      <OnboardClient loginUrl={`${issuer()}/login`} />
    </>
  );
}
