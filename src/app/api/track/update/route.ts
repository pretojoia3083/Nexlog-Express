import { NextRequest, NextResponse } from 'next/server';
import { upsertSession, addTrackPoint, deactivateSession } from '@/lib/tracking';
import { corsHeaders } from '@/lib/cors';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, nome, userEmail, userName, lat, lng, ativo } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400, headers: corsHeaders });
    }
    if (ativo === false) {
      await deactivateSession(sessionId);
      return NextResponse.json({ ok: true, deactivated: true }, { headers: corsHeaders });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400, headers: corsHeaders });
    }
    await upsertSession(sessionId, { nome, userEmail, userName });
    const session = await addTrackPoint(sessionId, { lat, lng, ts: Date.now() });
    return NextResponse.json({ ok: true, pontos: session?.pontos.length || 0 }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
