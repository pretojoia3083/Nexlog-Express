import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

const UA = 'NexLogExpress/1.0 (nexlogexpress@gmail.com)';

async function tryNominatim(lat: number, lng: number): Promise<string | null> {
  try {
    const url = 'https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
    }).toString();
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!resp.ok) return null;
    const data = await resp.json();
    return typeof data?.display_name === 'string' && data.display_name ? data.display_name : null;
  } catch {
    return null;
  }
}

async function tryPhoton(lat: number, lng: number): Promise<string | null> {
  try {
    const url = 'https://photon.komoot.io/reverse?' + new URLSearchParams({ lat: String(lat), lon: String(lng), lang: 'pt' }).toString();
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const f = data?.features?.[0];
    const props = f?.properties || {};
    const name = props?.name;
    const city = props?.city || props?.town || props?.village || props?.municipality || '';
    const state = props?.state || '';
    const parts = [name, city, state].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '');
  if (isNaN(lat) || isNaN(lon)) return NextResponse.json({ error: 'lat/lon required' }, { status: 400, headers: corsHeaders });

  let address: string | null = null;
  address = await tryNominatim(lat, lon);
  if (!address) address = await tryPhoton(lat, lon);

  if (address) return NextResponse.json({ address }, { headers: corsHeaders });
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
