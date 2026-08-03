import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

const EVOLUTION_API_URL = 'https://evolution-api-production-acd9.up.railway.app';
const EVOLUTION_API_KEY = 'b69c807afa6faa035e0260e738c0517c8d532242f6f2818dcf287ad639ae7031';
const INSTANCE_NAME = 'NEXLOG EXPRESS';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { number, message, media, fileName, caption } = await req.json();
    if (!number) {
      return NextResponse.json({ error: 'number are required' }, { status: 400, headers: corsHeaders });
    }
    let cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length <= 11 && !cleanNumber.startsWith('55')) {
      cleanNumber = '55' + cleanNumber;
    }
    const formattedNumber = cleanNumber + '@s.whatsapp.net';

    if (media) {
      let mediaValue = media;
      if (typeof mediaValue === 'string' && mediaValue.includes('base64,')) {
        mediaValue = mediaValue.substring(mediaValue.indexOf('base64,') + 7);
      }
      const resp = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${encodeURIComponent(INSTANCE_NAME)}`, {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: formattedNumber,
          mediatype: 'document',
          media: mediaValue,
          fileName: fileName || 'Orcamento.pdf',
          caption: caption || message || '',
        }),
      });
      const textBody = await resp.text();
      let data;
      try { data = JSON.parse(textBody); } catch { data = { raw: textBody }; }
      if (!resp.ok) {
        const detail = data?.response?.message || data?.error || data?.raw || JSON.stringify(data);
        return NextResponse.json({ error: detail, status: resp.status }, { headers: corsHeaders });
      }
      return NextResponse.json({ success: true, data }, { headers: corsHeaders });
    }

    if (!message) {
      return NextResponse.json({ error: 'message are required' }, { status: 400, headers: corsHeaders });
    }
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
      return NextResponse.json({ error: detail, status: resp.status }, { headers: corsHeaders });
    }
    return NextResponse.json({ success: true, data }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) || 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
}
