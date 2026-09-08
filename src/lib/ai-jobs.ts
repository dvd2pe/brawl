// Shared job store for AI generation (used by both /api/generate-sprite and /api/generate-status)
export interface Job {
  status: 'pending' | 'done' | 'error';
  base64?: string;
  error?: string;
  prompt: string;
  size: string;
  startedAt: number;
  completedAt?: number;
}

export const jobs = new Map<string, Job>();

// Cleanup old jobs (older than 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.startedAt > 10 * 60 * 1000) jobs.delete(id);
    }
  }, 60 * 1000);
}

// Normal generation (no reference image)
export async function startGeneration(jobId: string, prompt: string, size: string) {
  try {
    console.log(`[ai] job ${jobId}: generating "${prompt.slice(0, 60)}..." size=${size}`);
    const t0 = Date.now();
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({ prompt, size });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!response?.data?.[0]?.base64) throw new Error('Risposta AI vuota');
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'done';
      job.base64 = response.data[0].base64;
      job.completedAt = Date.now();
    }
    console.log(`[ai] job ${jobId}: ✓ done in ${dt}s`);
  } catch (e: any) {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = e?.message || 'errore sconosciuto';
      job.completedAt = Date.now();
    }
    console.error(`[ai] job ${jobId}: ✗ ${e?.message}`);
  }
}

// Image editing generation (with reference image for consistency)
export async function startEditGeneration(jobId: string, prompt: string, size: string, referenceImage: string) {
  try {
    console.log(`[ai-edit] job ${jobId}: editing with reference, prompt="${prompt.slice(0, 60)}..."`);
    const t0 = Date.now();
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    // Use image editing API for consistency with reference
    const response = await zai.images.generations.edit({
      prompt: prompt + ' — must match the style, colors, proportions and character design of the reference image exactly. Same character, same art style.',
      images: [{ url: referenceImage }],
      size,
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!response?.data?.[0]?.base64) throw new Error('Risposta AI edit vuota');
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'done';
      job.base64 = response.data[0].base64;
      job.completedAt = Date.now();
    }
    console.log(`[ai-edit] job ${jobId}: ✓ done in ${dt}s`);
  } catch (e: any) {
    console.error(`[ai-edit] job ${jobId}: ✗ ${e?.message}, falling back to normal generation`);
    // Fallback to normal generation if editing fails
    await startGeneration(jobId, prompt, size);
  }
}
