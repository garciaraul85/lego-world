import { GpuRenderer, gpuReady } from './gpu/gpu-renderer';
import { Renderer } from './renderer';

/**
 * Milestone 2b, 10c: what draws a 3D view. WebGPU where the browser has it and it is picked; WebGL otherwise
 * (and always as the fallback). Both draw a scene the same way.
 */
export type SceneRenderer = Renderer | GpuRenderer;

/** auto: WebGL until the WebGPU renderer draws characters too (part 2); webgpu: WebGPU when the browser has it */
export const RENDERER_CHOICES = ['auto', 'webgpu', 'webgl'] as const;
export type RendererChoice = (typeof RENDERER_CHOICES)[number];

export const RENDERER_LABEL: Record<RendererChoice, string> = {
  auto: 'Auto',
  webgpu: 'WebGPU',
  webgl: 'WebGL',
};

/** what a choice draws with in this browser */
export function rendererFor(choice: RendererChoice): 'webgpu' | 'webgl' {
  return choice === 'webgpu' && gpuReady() ? 'webgpu' : 'webgl';
}

export function createSceneRenderer(canvas: HTMLCanvasElement, choice: RendererChoice): SceneRenderer {
  if (rendererFor(choice) === 'webgpu') {
    try {
      return new GpuRenderer(canvas);
    } catch (e) {
      console.warn('WebGPU could not draw here; WebGL draws instead.', e);
    }
  }
  return new Renderer(canvas);
}
