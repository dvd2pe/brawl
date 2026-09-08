import { NextRequest, NextResponse } from 'next/server';
import { jobs, startGeneration, startEditGeneration } from '@/lib/ai-jobs';

// POST /api/generate-sprite → start job (returns immediately with jobId)
// Body: { prompt, size, referenceImage? }
// If referenceImage is provided, uses image editing (zai.images.generations.edit)
// for character consistency across poses.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = (body?.prompt || '').toString().trim();
    const size = (body?.size || '1024x1024').toString();
    const referenceImage = body?.referenceImage || null; // base64 data URL for consistency
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt richiesto' }, { status: 400 });
    }
    const SUPPORTED = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'];
    const finalSize = SUPPORTED.includes(size) ? size : '1024x1024';

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    jobs.set(jobId, { status: 'pending', prompt, size: finalSize, startedAt: Date.now() });

    // Start generation in background (non-blocking)
    if (referenceImage) {
      startEditGeneration(jobId, prompt, finalSize, referenceImage);
    } else {
      startGeneration(jobId, prompt, finalSize);
    }

    return NextResponse.json({ success: true, jobId, status: 'pending' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}

// GET /api/generate-status?jobId=xxx → poll job status
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ success: false, error: 'jobId richiesto' }, { status: 400 });
  }
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job non trovato' }, { status: 404 });
  }
  const elapsed = job.completedAt
    ? ((job.completedAt - job.startedAt) / 1000).toFixed(1) + 's'
    : ((Date.now() - job.startedAt) / 1000).toFixed(1) + 's (in corso)';
  return NextResponse.json({
    success: true,
    jobId,
    status: job.status,
    base64: job.base64,
    error: job.error,
    prompt: job.prompt,
    size: job.size,
    elapsed,
  });
}
