import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/tracking';
import { corsHeaders } from '@/lib/cors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404, headers: corsHeaders });
  return NextResponse.json(session, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
