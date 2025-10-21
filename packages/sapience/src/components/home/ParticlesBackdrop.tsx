'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  color: string;
  pulsePhase: number;
  pulseSpeed: number;
};

export default function ParticlesBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Build palette from CSS category variables (globals.css: --category-1..7)
    function readCategoryHslVars(): string[] {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      const result: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const val = styles.getPropertyValue(`--category-${i}`).trim();
        if (val) result.push(val); // e.g., "217 91% 60%"
      }
      return result;
    }

    function hslToHsla(hslTriplet: string, alpha: number): string {
      // Accepts strings like "217 91% 60%" and returns "hsla(217, 91%, 60%, a)"
      const parts = hslTriplet.split(/\s+/);
      if (parts.length < 3) return `rgba(255,255,255,${alpha})`;
      const [h, s, l] = parts;
      return `hsla(${h.replace(/,/, '')}, ${s.replace(/,/, '')}, ${l.replace(/,/, '')}, ${alpha})`;
    }

    function withAlpha(hsla: string, alpha: number): string {
      const match = hsla.match(
        /hsla\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/
      );
      if (!match) return hsla;
      const a = Math.max(0, Math.min(1, alpha));
      return `hsla(${match[1]}, ${match[2]}, ${match[3]}, ${a})`;
    }

    let palette = (() => {
      const hsls = readCategoryHslVars();
      if (hsls.length === 0) return ['rgba(255,255,255,0.25)'];
      return hsls.map((hsl) => hslToHsla(hsl, 0.25));
    })();

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const state: { particles: Particle[] } = { particles: [] };

    const resize = () => {
      // Lower DPR for performance; crispness tradeoff but big perf win
      const dpr = 1;
      const width = (canvas.width = Math.floor(canvas.clientWidth * dpr));
      const height = (canvas.height = Math.floor(canvas.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Re-seed particles on resize
      const area = (width / dpr) * (height / dpr);
      const density = 0.00006; // fewer particles per px for perf
      const count = Math.max(25, Math.min(140, Math.floor(area * density)));
      // Refresh palette (dark/light mode, or CSS var updates)
      const hsls = readCategoryHslVars();
      if (hsls.length > 0) palette = hsls.map((hsl) => hslToHsla(hsl, 0.3));
      state.particles = new Array(count)
        .fill(0)
        .map(() => newParticle(width / dpr, height / dpr));
    };

    function newParticle(w: number, h: number): Particle {
      const r = 0.8 + Math.random() * 1.2; // smaller, ~0.8..2.0 px
      const x = Math.random() * w;
      const y = Math.random() * h;
      const speed = 80 + Math.random() * 120; // slower px/s on average (80..200)
      const vx = speed; // primarily rightward motion
      const vy = (Math.random() - 0.5) * 10; // very subtle vertical drift
      const color = palette[Math.floor(Math.random() * palette.length)];
      const pulsePhase = Math.random() * Math.PI * 2;
      const pulseSpeed = 0.6 + Math.random() * 0.7; // 0.6..1.3 Hz
      return { x, y, r, vx, vy, color, pulsePhase, pulseSpeed };
    }

    const draw = (timeSeconds: number) => {
      // Clear using backing store size to avoid any transform-related artifacts
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Ensure we only fill (no strokes)
      ctx.lineWidth = 0;
      ctx.strokeStyle = 'transparent';

      for (const p of state.particles) {
        // Subtle pulsing halo: ~1–2 px around the core
        const pulse =
          0.7 +
          0.3 *
            Math.sin(timeSeconds * p.pulseSpeed * Math.PI * 2 + p.pulsePhase);
        const blur = 1.2 + pulse * 1.0; // ~1.6..2.2 px
        const shadowAlpha = 0.18 + 0.08 * pulse; // slightly stronger

        ctx.save();
        ctx.shadowBlur = blur;
        ctx.shadowColor = withAlpha(p.color, shadowAlpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(p.r, 1.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const step = (ts: number) => {
      const prev = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      lastTsRef.current = ts;

      if (!reduceMotion) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        for (const p of state.particles) {
          // Slight ease to reduce jank on low-power devices
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < -p.r) p.y = h + p.r;
          if (p.y > h + p.r) p.y = -p.r;
          if (p.x > w + p.r) {
            // respawn from left with random y
            p.x = -p.r;
            p.y = Math.random() * h;
            p.r = 0.8 + Math.random() * 1.2; // keep small on respawn
            const speed = 80 + Math.random() * 120; // slower on respawn as well
            p.vx = speed;
            p.vy = (Math.random() - 0.5) * 10;
            p.color = palette[Math.floor(Math.random() * palette.length)];
            p.pulsePhase = Math.random() * Math.PI * 2;
            p.pulseSpeed = 0.6 + Math.random() * 0.7;
          }
        }
      }

      draw(ts / 1000);
      animationRef.current = requestAnimationFrame(step);
    };

    resize();
    step(performance.now());
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
