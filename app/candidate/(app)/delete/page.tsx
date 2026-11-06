import { pageViewer } from '@/server/page-auth';
import { PageHeader, Card } from '@/components/ui';
import { DeleteForm } from '@/components/candidate-forms';

export default async function Delete() {
  await pageViewer('candidate');
  return (
    <div className="max-w-2xl">
      <PageHeader title="Delete profile" back={{ href: '/candidate/privacy', label: 'Privacy' }} />
      <Card>
        <h3 className="text-[16px] font-semibold">What is removed</h3>
        <ul className="mt-1 list-disc pl-5 text-[15px]"><li>Your name, email and phone</li><li>Your CV files and extracted text</li><li>Your answers, evidence and profile versions</li><li>Screening notes and recordings about you</li><li>Your access, immediately, and every employer&apos;s access to your name</li></ul>
        <h3 className="mt-4 text-[16px] font-semibold">What remains</h3>
        <p className="text-[15px]">Minimal financial records for any recorded hire: dates, amounts and an opaque reference with no name or email.</p>
        <p className="mt-3 rounded-lg bg-warning-tint px-3 py-2 text-[14px] text-warning">Information already disclosed cannot be recalled from a person&apos;s memory or from copies made outside this app.</p>
        <div className="mt-5"><DeleteForm /></div>
      </Card>
    </div>
  );
}
