import React, { useEffect, useRef } from 'react';

// Живые градиентные линии в фоне героя: набор плавных волн, в которых
// по некоторым линиям пробегает яркий «импульс». Рисуется на canvas,
// останавливается за пределами экрана и при prefers-reduced-motion.
const LINE_COUNT = 30;
const PULSE_EVERY = 4;

export default function GradientLines({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;
    let base;
    let pulse;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      base = ctx.createLinearGradient(0, 0, width, 0);
      base.addColorStop(0, 'rgba(139,108,255,0.0)');
      base.addColorStop(0.18, 'rgba(139,108,255,0.55)');
      base.addColorStop(0.52, 'rgba(77,124,255,0.5)');
      base.addColorStop(0.8, 'rgba(63,216,232,0.42)');
      base.addColorStop(1, 'rgba(228,104,217,0.0)');

      pulse = ctx.createLinearGradient(0, 0, width, 0);
      pulse.addColorStop(0, 'rgba(255,255,255,0)');
      pulse.addColorStop(0.3, 'rgba(190,175,255,0.95)');
      pulse.addColorStop(0.7, 'rgba(120,230,245,0.95)');
      pulse.addColorStop(1, 'rgba(255,255,255,0)');
    };

    const curveY = (nx, p, t) => {
      const spread = (p - 0.5) * height * 0.26 * (0.25 + nx * 0.95);
      const wave1 = Math.sin(nx * 3.1 + t * 0.00042 + p * 1.7) * height * 0.11 * (0.55 + nx * 0.9);
      const wave2 = Math.sin(nx * 7.3 - t * 0.0006 + p * 4.1) * height * 0.022;
      return height * 0.74 + spread + wave1 * 0.8 + wave2;
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = base;

      const step = 8;
      const paths = [];
      for (let i = 0; i < LINE_COUNT; i += 1) {
        const p = i / (LINE_COUNT - 1);
        const path = new Path2D();
        for (let x = 0; x <= width + step; x += step) {
          const y = curveY(x / width, p, t);
          if (x === 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        paths.push(path);
        ctx.stroke(path);
      }

      ctx.lineWidth = 1.6;
      ctx.strokeStyle = pulse;
      for (let i = 0; i < LINE_COUNT; i += PULSE_EVERY) {
        const len = width * (0.1 + (i % 3) * 0.04);
        ctx.setLineDash([len, width * 2]);
        ctx.lineDashOffset = -((t * (0.1 + (i % 5) * 0.02) + i * 160) % (width * 2 + len));
        ctx.stroke(paths[i]);
      }
      ctx.setLineDash([]);
    };

    const loop = (t) => {
      if (visible) draw(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduce) {
      draw(2200);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(2200); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(canvas);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={`gradient-lines ${className}`} aria-hidden="true" />;
}
