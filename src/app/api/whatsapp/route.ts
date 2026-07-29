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
    let cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length <= 11 && !cleanNumber.startsWith('55')) {
      cleanNumber = '55' + cleanNumber;
    }
    const formattedNumber = cleanNumber + '@s.whatsapp.net';
    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(INSTANCE_NAME)}`, {
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
    const textBody = await resp.text();
    let data;
    try { data = JSON.parse(textBody); } catch { data = { raw: textBody }; }
    if (!resp.ok) {
      const detail = data?.response?.message || data?.error || data?.raw || JSON.stringify(data);
      return NextResponse.json({ error: detail, status: resp.status });
    }
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) || 'Unknown error' }, { status: 500 });
  }
}
