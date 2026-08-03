import { NextRequest, NextResponse } from 'next/server';
import { listActiveSessions } from '@/lib/tracking';
import { corsHeaders } from '@/lib/cors';

export async function GET(req: NextRequest) {
  const active = await listActiveSessions();
  return NextResponse.json(active, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
