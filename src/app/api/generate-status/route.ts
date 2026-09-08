import { NextRequest, NextResponse } from 'next/server';
import { jobs } from '@/lib/ai-jobs';

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
