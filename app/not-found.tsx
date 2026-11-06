import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-[24px]">This item is no longer available</h1>
      <p className="mt-2 text-muted">It may have been removed, or you may not have access to it.</p>
      <p className="mt-4"><Link href="/">Return to your home page</Link></p>
    </main>
  );
}
