import Link from 'next/link';
export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-[24px]">You do not have access to this area</h1>
      <p className="mt-3"><Link href="/">Return to your home page</Link></p>
    </main>
  );
}
