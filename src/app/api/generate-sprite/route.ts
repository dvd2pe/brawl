import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// POST /api/generate-sprite
// Body: { prompt: string, size?: string }
// Returns: { success: true, base64: string, prompt: string, size: string }
//
// Usa z-ai-web-dev-sdk lato backend (NON client).
// L'immagine generata è in base64 (PNG). Il client la converte in canvas per l'editor.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = (body?.prompt || '').toString().trim();
    const size = (body?.size || '1024x1024').toString();

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt richiesto' }, { status: 400 });
    }

    // dimensioni supportate dal SDK
    const SUPPORTED = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
    const finalSize = SUPPORTED.includes(size) ? size : '1024x1024';

    const zai = await ZAI.create();
    const response = await zai.images.generations.create({
      prompt,
      size: finalSize,
    });

    if (!response?.data?.[0]?.base64) {
      return NextResponse.json({ success: false, error: 'Risposta AI vuota' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      base64: response.data[0].base64,
      prompt,
      size: finalSize,
    });
  } catch (e: any) {
    console.error('[generate-sprite] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'errore sconosciuto' }, { status: 500 });
  }
}
