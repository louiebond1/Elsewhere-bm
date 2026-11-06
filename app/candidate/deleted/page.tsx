import Link from 'next/link';
export default function Deleted() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-[24px]">Your profile is being deleted</h1>
      <p className="mt-3 text-[15px] text-muted">Access has been removed and you have been signed out. Private files and answers are removed by a background job. Information already shared cannot be recalled from a person&apos;s memory or external copies.</p>
      <p className="mt-4"><Link href="/demo/personas">Back to the demo</Link></p>
    </main>
  );
}
