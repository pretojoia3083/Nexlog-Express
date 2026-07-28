import { NextRequest, NextResponse } from 'next/server';

const EVOLUTION_API_URL = 'https://evolution-api-production-acd9.up.railway.app';
const EVOLUTION_API_KEY = 'b69c807afa6faa035e0260e738c0517c8d532242f6f2818dcf287ad639ae7031';
const INSTANCE_NAME = 'NEXLOG EXPRESS';

export async function POST(req: NextRequest) {
  try {
    const { number, message } = await req.json();
    if (!number || !message) {
      return NextResponse.json({ error: 'number and message are required' }, { status: 400 });
    }
    const formattedNumber = number.replace(/\D/g, '') + '@s.whatsapp.net';
    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: formattedNumber,
        text: message,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ error: data }, { status: resp.status });
    }
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
