import { protectedResourceMetadata } from '@/server/connectors/oauth';
export const dynamic = 'force-dynamic';
export function GET() { return Response.json(protectedResourceMetadata(), { headers: { 'cache-control': 'public, max-age=300' } }); }
