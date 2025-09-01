# Mandelbrot Codebase Deep Review — Unstick Plan

Date: 2025-09-01

## Executive Summary

- Reality vs docs are misaligned: README/TODO claim React, Zustand, WebGPU, workers, arbitrary precision; codebase is vanilla TS + WebGL2, no React/Zustand/Workers/WebGPU.
- Deep‑zoom path is effectively disabled: the DD fragment shader never calls DD math and falls back to standard float math.
- Duplicate and inconsistent DD arithmetic exists between two GLSL sources with conflicting constants; the single‑precision split constant is wrong in one file.
- Tests validate only CPU/TS double‑double, not the GPU path; precision switch is unverified.
- Agents loop because they chase contradictory status docs, duplicated code, and toggles labeled “enabled” while code hard‑disables them.

## Ground Truth (What’s Actually Here)

- Frontend: vanilla TypeScript + Vite (`apps/web`), custom minimal UI (`HUD`, `Controls`), simple in‑house store (not Zustand).
- Rendering: WebGL2 full‑screen quad with two fragment shaders:
  - `fragment.glsl`: standard Mandelbrot + optional progressive and AA.
  - `fragment-dd.glsl`: intended DD path, currently using standard math.
- Precision manager: `WebGLRendererDD.ts` switches to DD below threshold (`5e-6`).
- Math libs: robust TS double‑double (`apps/web/src/math/*.ts`), independent GLSL DD arithmetic (`apps/web/src/render/shaders/dd-arithmetic.glsl`).
- Tests: Vitest unit tests cover TS DD + complex DD; Playwright e2e snapshots for visuals. No tests assert GPU DD mode works.

## Key Findings (Root Causes)

1) DD shader path is bypassed
- File: `apps/web/src/render/shaders/fragment-dd.glsl`
- In `main()`, DD branch uses standard `mandelbrot(c)` with float uniforms; `mandelbrotDD` never called.
- Result: Deep zoom behaves like regular precision; “solid color” and “grid” analyses become misleading.

2) Conflicting DD arithmetic implementations
- Files: `fragment-dd.glsl` vs `dd-arithmetic.glsl`
- Different function names and constants (e.g., `DD_SPLIT`). For single‑precision GLSL, correct split is `4097.0` (24‑bit mantissa); `fragment-dd.glsl` uses `134217729.0` (Double’s split), which is invalid in single‑precision and causes quantization/blocks.
- Duplication invites divergence and agent churn.

3) Documentation inflation and contradictions
- README and TODO claim React/Zustand/Workers/WebGPU/IndexedDB, which are not implemented.
- `deep_zoom_debug.md` asserts both “DD arithmetic appears functional” and “Root cause in DD coordinate conversion” while the DD shader is not actually used.
- Agents keep “fixing” non‑existent or already‑abandoned subsystems.

4) Precision switch is unobservable and untested
- No clear UI/HUD indicator of precision mode; logs exist but aren’t part of tests.
- E2E tests don’t ensure the DD shader is selected under threshold or that results differ from standard.

5) Progressive rendering complicates debugging
- Viewer toggles progressive modes, but comments say “disabled due to chaos issues”. This creates ambiguity and flicker during diagnosis.

## Unstick Plan (Minimal, Deterministic Steps)

The goal is to enable a working DD GPU path first, with clear observability. Keep scope small and eliminate duplication.

Step 1 — Make DD shader actually use DD math
- File: `apps/web/src/render/shaders/fragment-dd.glsl`
- Replace the DD branch in `main()` to:
  - Compute `vec4 c_dd = viewportToComplexDD(uv);`
  - Compute `mu = mandelbrotDD(c_dd);`
- Remove the “FALLBACK” that calls standard `mandelbrot` inside the DD branch.

Step 2 — Use a single, correct DD arithmetic source
- File: `fragment-dd.glsl`
- Remove the local, partial DD helpers. Inline or concatenate the canonical ones from `dd-arithmetic.glsl` (or copy exact content once) to avoid drift.
- Ensure `DD_SPLIT` is `4097.0` for single‑precision GLSL. Do not use `134217729.0` in WebGL2.
- Align function names with `dd-arithmetic.glsl` (e.g., `mandelbrot_dd`, `viewport_to_complex_dd`) or rename consistently across the shader.

Step 3 — Wire DD uniforms and scaling consistently
- File: `WebGLRendererDD.ts`
- Always set `u_center_dd`, `u_scale_dd`, and `u_use_dd_precision` when DD mode is active; keep `u_center`/`u_scale` set too for debug paths only.
- Verify threshold: keep `DD_THRESHOLD = 5e-6` initially. We can adjust later based on visuals.

Step 4 — Add explicit precision observability
- HUD: display “Precision: STANDARD/DD” using `getPrecisionInfo()`.
- Shader: keep a subtle, temporary blue tint in DD mode (already present) but remove once tests are in place.
- Console: single line on switch (already present).

Step 5 — Add a focused e2e assertion for precision switching
- Create a headless check that:
  - Loads home view (STANDARD expected), asserts console log contains “STANDARD → DD” only after zooming past threshold.
  - Optionally, sample a small patch of pixels before/after DD activation to ensure an image change (quick heuristic).
- Keep one deterministic deep zoom location, not multiple bookmarks.

Step 6 — Freeze progressive rendering for now
- Disable progressive paths during DD bring‑up to reduce non‑determinism. Re‑enable after DD visuals are correct.

## Concrete Patch Sketches (for the Agent)

1) fragment-dd.glsl — replace DD branch
```
// inside main()
if (u_use_dd_precision) {
  vec4 c_dd = viewportToComplexDD(uv);
  mu = mandelbrotDD(c_dd);
} else {
  vec2 c = u_center + uv * u_scale;
  mu = mandelbrot(c);
}
```

2) fragment-dd.glsl — fix split constant and import
```
// Use single-precision split for WebGL2
const float DD_SPLIT = 4097.0; // 2^12 + 1

// Prefer: inline content from dd-arithmetic.glsl verbatim
// Or ensure all DD helpers here match dd-arithmetic.glsl exactly
```

3) WebGLRendererDD.ts — uniform wiring (already mostly correct)
```
// setDDUniforms(...)
const useDD = params.useAutoPrecision !== false && PrecisionManager.needsHighPrecision(params.scale);
gl.uniform1i(u_use_dd_precision, useDD ? 1 : 0);
// Always send center/scale DD (from numberToDD if DD not provided)
```

4) HUD — display current precision (small UX)
```
// After render, query renderer.getPrecisionInfo() and print “DD” vs “STANDARD”
```

5) Minimal e2e — assert precision switch
```
// Pseudocode
go to /; wait for first frame; assert no DD log
wheel zoom to push scale < 5e-6; wait; assert console contains ‘STANDARD → DD’
```

## Acceptance Checklist

- At scales < 5e-6, shader calls `mandelbrotDD` and produces non‑flat imagery (no “solid color”).
- No DD math duplication: a single GLSL implementation with `DD_SPLIT = 4097.0`.
- HUD or console clearly indicates precision switches.
- One Playwright test verifies the switch and captures a stable screenshot.
- Progressive rendering is off during DD validation runs.

## Why The Agent Was Looping (and How This Fixes It)

- Contradictory docs sent it after phantom systems (React/Zustand/Workers/WebGPU) and “already working” claims.
- DD shader’s fallback made every “DD bug hunt” inconclusive; duplicated math with wrong constants reinforced confusion.
- The unstick plan removes contradictions, picks one DD source of truth, wires it in, and adds observability + a single test that proves the mode switch.

## Next (Optional, After DD Works)

- Progressive pipeline: re‑enable progressively; restrict to reproducible modes (interleaved first), then stochastic with fixed seeds.
- Performance: profile iterations and AA; consider per‑zoom iteration scheduling.
- Docs cleanup: trim README/TODO to reflect actual shipped features; move roadmap claims behind “Future”.
- ESLint: either remove `.eslintrc.cjs` or adopt ESLint + TS rules and wire it to CI.

## File Pointers

- Shader entry points:
  - `apps/web/src/render/shaders/fragment.glsl`
  - `apps/web/src/render/shaders/fragment-dd.glsl`
  - `apps/web/src/render/shaders/dd-arithmetic.glsl`
- Renderer and precision switch:
  - `apps/web/src/render/WebGLRendererDD.ts`
- Viewer and UI:
  - `apps/web/src/MandelbrotViewer.ts`
  - `apps/web/src/ui/HUD.ts`
  - `apps/web/src/ui/Controls.ts`
- CPU DD (for reference/tests):
  - `apps/web/src/math/dd.ts`
  - `apps/web/src/math/complex-dd.ts`
  - `tests/unit/dd-arithmetic.test.ts`

---

If you want, I can implement the shader DD fix and add the precision indicator + a minimal Playwright assertion as a follow‑up PR.

