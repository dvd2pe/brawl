# SPDX-License-Identifier: Apache-2.0
"""ZAI provider — uses z-ai-web-dev-sdk (ZAI.create + images.generations.create/edit).

Transparency strategy: chroma — the SDK returns JPEG without alpha channel,
so we generate on a magenta chroma key and let sprite-gen's extractor key it out.
"""

from __future__ import annotations

import time, os, subprocess, json, tempfile
from pathlib import Path

from .base import (
    GEN_TIMEOUT_SECONDS, TRANSPARENCY_CHROMA,
    GenRequest, GenTimeoutError, ProviderRun, verify_png,
)

NAME = "zai"
TRANSPARENCY = TRANSPARENCY_CHROMA


def _build_prompt_with_chroma(prompt: str) -> str:
    return (
        f"{prompt}\n\n"
        "IMPORTANT: Use a solid magenta (#FF00FF) background — no gradient, "
        "no texture, no shadow on the background. The entire background "
        "must be pure magenta (#FF00FF, RGB 255,0,255) so it can be keyed "
        "out. Do NOT use transparency or alpha — use solid magenta instead."
    )


def generate(request: GenRequest, workdir: Path = None, *, model: str | None = None) -> ProviderRun:
    t0 = time.monotonic()
    prompt = _build_prompt_with_chroma(request.prompt)
    raw_path = request.raw
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    jpg_path = str(raw_path).replace('.png', '.jpg')
    has_refs = bool(request.refs)

    # Build the Bun script — use a converter script file instead of inline execSync
    # to avoid escape hell
    converter_py = tempfile.NamedTemporaryFile(suffix='.py', mode='w', delete=False)
    converter_py.write(f"from PIL import Image; Image.open(r'{jpg_path}').save(r'{raw_path}')\n")
    converter_py.close()

    if has_refs:
        ref_paths = [str(r.resolve()) for r in request.refs]
        refs_str = json.dumps(ref_paths)
        prompt_str = json.dumps(prompt)
        jpg_str = json.dumps(jpg_path)
        conv_str = json.dumps(converter_py.name)
        script = (
            "import ZAI from 'z-ai-web-dev-sdk';\n"
            "import fs from 'fs';\n"
            "import { execSync } from 'child_process';\n"
            "(async () => {\n"
            f"  const refs = {refs_str};\n"
            "  const zai = await ZAI.create();\n"
            "  const refBuffers = refs.map(p => fs.readFileSync(p));\n"
            "  const refDataUrls = refBuffers.map(b => 'data:image/png;base64,' + b.toString('base64'));\n"
            "  const response = await zai.images.generations.edit({\n"
            f"    prompt: {prompt_str},\n"
            "    images: refDataUrls.map(url => ({ url })),\n"
            "    size: '1024x1024',\n"
            "  });\n"
            "  const buf = Buffer.from(response.data[0].base64, 'base64');\n"
            f"  fs.writeFileSync({jpg_str}, buf);\n"
            f"  execSync('python3 ' + {conv_str});\n"
            f"  fs.unlinkSync({jpg_str});\n"
            "  console.log('OK');\n"
            "})().catch(e => { console.error(e); process.exit(1); });\n"
        )
    else:
        prompt_str = json.dumps(prompt)
        jpg_str = json.dumps(jpg_path)
        conv_str = json.dumps(converter_py.name)
        script = (
            "import ZAI from 'z-ai-web-dev-sdk';\n"
            "import fs from 'fs';\n"
            "import { execSync } from 'child_process';\n"
            "(async () => {\n"
            "  const zai = await ZAI.create();\n"
            "  const response = await zai.images.generations.create({\n"
            f"    prompt: {prompt_str},\n"
            "    size: '1024x1024',\n"
            "  });\n"
            "  const buf = Buffer.from(response.data[0].base64, 'base64');\n"
            f"  fs.writeFileSync({jpg_str}, buf);\n"
            f"  execSync('python3 ' + {conv_str});\n"
            f"  fs.unlinkSync({jpg_str});\n"
            "  console.log('OK');\n"
            "})().catch(e => { console.error(e); process.exit(1); });\n"
        )

    with tempfile.NamedTemporaryFile(suffix='.ts', mode='w', delete=False) as f:
        f.write(script)
        script_path = f.name

    try:
        result = subprocess.run(
            ['bun', script_path],
            capture_output=True, text=True,
            timeout=GEN_TIMEOUT_SECONDS,
            cwd='/home/z/my-project',
        )
        if result.returncode != 0:
            raise RuntimeError(f"ZAI generation failed: {result.stderr[:500]}")
    finally:
        Path(script_path).unlink(missing_ok=True)
        Path(converter_py.name).unlink(missing_ok=True)
        if os.path.exists(jpg_path):
            os.unlink(jpg_path)

    if not raw_path.exists():
        raise RuntimeError(f"ZAI did not write to {raw_path}")
    verify_png(raw_path)

    elapsed = time.monotonic() - t0
    return ProviderRun(provider=NAME, elapsed_seconds=elapsed, model=model)
