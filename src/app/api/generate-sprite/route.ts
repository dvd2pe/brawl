import { NextRequest, NextResponse } from 'next/server';
import { jobs, startGeneration } from '@/lib/ai-jobs';

// POST /api/generate-sprite → start job (returns immediately with jobId)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = (body?.prompt || '').toString().trim();
    const size = (body?.size || '1024x1024').toString();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt richiesto' }, { status: 400 });
    }
    const SUPPORTED = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
    const finalSize = SUPPORTED.includes(size) ? size : '1024x1024';

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, { status: 'pending', prompt, size: finalSize, startedAt: Date.now() });

    // Start generation in background (non-blocking)
    startGeneration(jobId, prompt, finalSize);

    return NextResponse.json({ success: true, jobId, status: 'pending' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
