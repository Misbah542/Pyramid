/** WebGL capability probe used to decide between the 3D scene and a fallback. */

export interface WebGLSupport {
  supported: boolean;
  renderer: string | null;
  /** True when the context reports a software rasteriser. */
  software: boolean;
}

let cached: WebGLSupport | null = null;

export function detectWebGL(): WebGLSupport {
  if (cached) return cached;
  if (typeof document === 'undefined') {
    cached = { supported: false, renderer: null, software: false };
    return cached;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      cached = { supported: false, renderer: null, software: false };
      return cached;
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null;
    const software = Boolean(renderer && /swiftshader|llvmpipe|software/i.test(renderer));
    cached = { supported: true, renderer, software };
    return cached;
  } catch {
    cached = { supported: false, renderer: null, software: false };
    return cached;
  }
}
