import { NextRequest, NextResponse } from 'next/server';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const SPRITE_GEN_BIN = '/home/z/my-project/repos/sprite-gen/.venv/bin/sprite-gen';
const RUNS_DIR = '/home/z/my-project/repos/sprite-gen/runs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const step = body.step;
    if (!step) return NextResponse.json({ success: false, error: 'step required' }, { status: 400 });

    fs.mkdirSync(RUNS_DIR, { recursive: true });

    if (step === 'prepare') {
      const runDir = path.join(RUNS_DIR, body.characterId || `char_${Date.now()}`);
      const args = [
        SPRITE_GEN_BIN, 'prepare',
        '--out-dir', runDir,
        '--character-id', body.characterId || 'character',
        '--cell-width', String(body.cellWidth || 150),
        '--cell-height', String(body.cellHeight || 160),
        '--description', String(body.description || 'A game character'),
      ];
      if (body.baseImage) {
        const baseDir = path.join(runDir, 'input');
        fs.mkdirSync(baseDir, { recursive: true });
        const basePath = path.join(baseDir, 'base.png');
        const baseData = body.baseImage.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(basePath, Buffer.from(baseData, 'base64'));
        args.push('--base-image', basePath);
      }
      if (body.style) args.push('--style', String(body.style));
      const { stdout } = await execAsync(args.join(' '), { timeout: 30000, env: { ...process.env, SPRITE_GEN_DEFAULT_PROVIDER: 'zai' } });
      const requestPath = path.join(runDir, 'sprite-request.json');
      let states: string[] = [];
      if (fs.existsSync(requestPath)) {
        const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
        states = Object.keys(req.states || {});
      }
      return NextResponse.json({ success: true, runDir, states, raw: stdout });

    } else if (step === 'gen-set') {
      const runDir = body.runDir;
      if (!runDir || !fs.existsSync(runDir)) return NextResponse.json({ success: false, error: 'runDir not found' }, { status: 400 });
      const states = body.states || '';
      const args = [SPRITE_GEN_BIN, 'gen-set', '--run-dir', runDir, '--provider', 'zai', '--concurrency', '1'];
      if (states) args.push('--states', states);
      const { stdout } = await execAsync(args.join(' '), { timeout: 600000, env: { ...process.env, SPRITE_GEN_DEFAULT_PROVIDER: 'zai' }, cwd: '/home/z/my-project' });
      const rawDir = path.join(runDir, 'raw');
      let rawImages: string[] = [];
      if (fs.existsSync(rawDir)) rawImages = fs.readdirSync(rawDir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
      return NextResponse.json({ success: true, runDir, rawImages, raw: stdout });

    } else if (step === 'extract') {
      const runDir = body.runDir;
      if (!runDir) return NextResponse.json({ success: false, error: 'runDir required' }, { status: 400 });
      try { await execAsync(`${SPRITE_GEN_BIN} extract --run-dir ${runDir} --allow-slot-fallback`, { timeout: 60000 }); } catch {}
      const framesDir = path.join(runDir, 'frames');
      let frames: { state: string; files: string[] }[] = [];
      if (fs.existsSync(framesDir)) {
        for (const entry of fs.readdirSync(framesDir)) {
          const ep = path.join(framesDir, entry);
          if (fs.statSync(ep).isDirectory()) {
            const files = fs.readdirSync(ep).filter(f => f.endsWith('.png'));
            if (files.length) frames.push({ state: entry, files });
          }
        }
      }
      return NextResponse.json({ success: true, runDir, frames });

    } else if (step === 'compose-atlas') {
      const runDir = body.runDir;
      if (!runDir) return NextResponse.json({ success: false, error: 'runDir required' }, { status: 400 });
      try { await execAsync(`${SPRITE_GEN_BIN} compose-atlas --run-dir ${runDir}`, { timeout: 30000 }); } catch {}
      const atlasPath = path.join(runDir, 'sprite-sheet-alpha.png');
      const manifestPath = path.join(runDir, 'manifest.json');
      const hasAtlas = fs.existsSync(atlasPath);
      const hasManifest = fs.existsSync(manifestPath);
      let manifest = null;
      if (hasManifest) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {} }
      return NextResponse.json({ success: true, runDir, hasAtlas, hasManifest, manifest });

    } else if (step === 'status') {
      const runDir = body.runDir;
      if (!runDir || !fs.existsSync(runDir)) return NextResponse.json({ success: false, error: 'runDir not found' }, { status: 404 });
      const rawDir = path.join(runDir, 'raw');
      const framesDir = path.join(runDir, 'frames');
      const atlasPath = path.join(runDir, 'sprite-sheet-alpha.png');
      const rawImages = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter(f => f.endsWith('.png')) : [];
      let frames: string[] = [];
      if (fs.existsSync(framesDir)) {
        for (const entry of fs.readdirSync(framesDir)) {
          const ep = path.join(framesDir, entry);
          if (fs.statSync(ep).isDirectory()) frames.push(...fs.readdirSync(ep).filter(f => f.endsWith('.png')).map(f => `${entry}/${f}`));
        }
      }
      return NextResponse.json({ success: true, runDir, rawImages, frames, hasAtlas: fs.existsSync(atlasPath) });

    } else if (step === 'list-runs') {
      const runs: any[] = [];
      if (fs.existsSync(RUNS_DIR)) {
        for (const entry of fs.readdirSync(RUNS_DIR)) {
          const rd = path.join(RUNS_DIR, entry);
          if (!fs.statSync(rd).isDirectory()) continue;
          let fc = 0;
          const fd = path.join(rd, 'frames');
          if (fs.existsSync(fd)) for (const s of fs.readdirSync(fd)) { const sp = path.join(fd, s); if (fs.statSync(sp).isDirectory()) fc += fs.readdirSync(sp).filter(f => f.endsWith('.png')).length; }
          runs.push({ dir: rd, name: entry, hasAtlas: fs.existsSync(path.join(rd, 'sprite-sheet-alpha.png')), frameCount: fc });
        }
      }
      return NextResponse.json({ success: true, runs });

    } else if (step === 'get-image') {
      const filePath = body.path;
      if (!filePath || !fs.existsSync(filePath)) return NextResponse.json({ success: false, error: 'file not found' }, { status: 404 });
      const data = fs.readFileSync(filePath);
      return NextResponse.json({ success: true, base64: data.toString('base64') });
    }

    return NextResponse.json({ success: false, error: `unknown step: ${step}` }, { status: 400 });
  } catch (e: any) {
    console.error('[sprite-gen-api] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'unknown error', stderr: e?.stderr?.slice(0, 500) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const step = url.searchParams.get('step') || 'list-runs';
  if (step === 'list-runs') {
    const runs: any[] = [];
    if (fs.existsSync(RUNS_DIR)) {
      for (const entry of fs.readdirSync(RUNS_DIR)) {
        const rd = path.join(RUNS_DIR, entry);
        if (!fs.statSync(rd).isDirectory()) continue;
        let fc = 0;
        const fd = path.join(rd, 'frames');
        if (fs.existsSync(fd)) for (const s of fs.readdirSync(fd)) { const sp = path.join(fd, s); if (fs.statSync(sp).isDirectory()) fc += fs.readdirSync(sp).filter(f => f.endsWith('.png')).length; }
        runs.push({ dir: rd, name: entry, hasAtlas: fs.existsSync(path.join(rd, 'sprite-sheet-alpha.png')), frameCount: fc });
      }
    }
    return NextResponse.json({ success: true, runs });
  }
  return NextResponse.json({ success: false, error: 'use POST' }, { status: 405 });
}
