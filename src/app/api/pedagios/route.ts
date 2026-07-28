import { NextRequest, NextResponse } from 'next/server';

const API_KEY = '28a7bffe-a2ed-45fd-b354-32add0e07491';
const BASE_URL = 'https://www.calcularpedagio.com.br/api/pontos/v3';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pontos } = body;

    if (!pontos || !Array.isArray(pontos) || pontos.length < 2) {
      return NextResponse.json(
        { error: 'Envie pelo menos 2 pontos no formato "Cidade/UF"' },
        { status: 400 }
      );
    }

    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ pontos }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || `Erro HTTP ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[api/pedagios]', error.message);
    return NextResponse.json(
      { error: 'Erro ao comunicar com a API de pedagios' },
      { status: 500 }
    );
  }
}
