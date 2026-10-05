import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { provideViewGrab } from '../ideaContext';
import './ideaWhere';

// Lends the idea wall's pin dialog a picture of the view (ideaContext.ts): one frame drawn now and read back at once,
// before the browser clears the drawing buffer, scaled down to a small JPEG. No post-processing: it's a reminder of
// where you were, not a photo (photo mode is for those).

const MAX_W = 960;

export function ViewGrab() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    provideViewGrab(() => {
      gl.render(scene, camera);
      const src = gl.domElement;
      if (!src.width || !src.height) return null;
      const scale = Math.min(1, MAX_W / src.width);
      const out = document.createElement('canvas');
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.72);
    });
    return () => provideViewGrab(null);
  }, [gl, scene, camera]);
  return null;
}
