import { NextRequest, NextResponse } from 'next/server';
import { getCachedGeocode, setCachedGeocode } from '@/lib/db';
import { corsHeaders } from '@/lib/cors';

const UA = 'NexLogExpress/1.0 (nexlogexpress@gmail.com)';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function tryNominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q: q + ', Brazil',
      format: 'json',
      limit: '1',
    }).toString();
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (resp.status === 429) return null;
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

async function tryNominatimNoBrazil(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q,
      format: 'json',
      limit: '1',
      countrycodes: 'br',
    }).toString();
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (resp.status === 429) return null;
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

async function tryPhoton(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=1&lang=pt';
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.features?.length > 0) {
      const c = data.features[0].geometry?.coordinates;
      if (c && c.length >= 2) return { lat: c[1], lng: c[0] };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400, headers: corsHeaders });

  const cached = await getCachedGeocode(q);
  if (cached) return NextResponse.json(cached, { headers: corsHeaders });

  let result: { lat: number; lng: number } | null = null;

  result = await tryNominatim(q);
  if (!result) {
    await sleep(600);
    result = await tryNominatimNoBrazil(q);
  }
  if (!result) {
    const simple = q.replace(/,\s*\d+/, '').replace(/ - /g, ', ').trim();
    if (simple !== q) {
      await sleep(600);
      result = await tryNominatim(simple);
    }
  }
  if (!result) {
    result = await tryPhoton(q);
  }

  if (result) {
    await setCachedGeocode(q, result);
    return NextResponse.json(result, { headers: corsHeaders });
  }
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
