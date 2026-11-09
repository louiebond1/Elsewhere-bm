import { authorizationServerMetadata } from '@/server/connectors/oauth';
export const dynamic = 'force-dynamic';
export function GET() { return Response.json(authorizationServerMetadata(), { headers: { 'cache-control': 'public, max-age=300' } }); }
