import { useEffect, useRef } from 'react';

/**
 * A rotating, faintly organic sphere made of glowing points, meant as a
 * full-bleed ambient background.
 *
 * Pure Canvas 2D + vanilla math — no three.js or other 3D library. Points
 * are distributed evenly over a sphere's surface (a "Fibonacci sphere"),
 * given a small fixed per-point bump so the silhouette isn't a perfect
 * ball, then rotated and projected each frame. Additive blending
 * (`globalCompositeOperation = 'lighter'`) is what creates the glow —
 * overlapping points brighten each other instead of just stacking flatly.
 */
export function ParticleSphere({
    pointCount = 5000,
    className,
}: {
    /** Fewer points = better performance on low-end devices. */
    pointCount?: number;
    className?: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const points = Array.from({ length: pointCount }, (_, i) => {
            const y = 1 - (i / (pointCount - 1)) * 2;
            const radiusAtY = Math.sqrt(1 - y * y);
            const theta = goldenAngle * i;
            const x = Math.cos(theta) * radiusAtY;
            const z = Math.sin(theta) * radiusAtY;

            // Fixed per-point bump so the silhouette reads as lumpy/organic
            // rather than a perfect ball, echoing the reference image.
            const bump = 1 + 0.14 * Math.sin(x * 6 + y * 8 + z * 5);
            // Small per-point size variance, biased toward small with a few
            // larger "highlight" points -- flat uniform dots read as sparse.
            const sizeSeed = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            const size = 0.9 + Math.abs(sizeSeed) * 1.8;

            return { x: x * bump, y: y * bump, z: z * bump, size };
        });

        let angle = 0;
        let width = 0;
        let height = 0;
        let dpr = 1;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = rect.width;
            height = rect.height;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        // Magenta -> violet -> deep blue, front-to-back, matching the reference.
        const colorForDepth = (z: number) => {
            const t = (z + 1) / 2; // 0 (back) .. 1 (front)
            const r = Math.round(120 + t * 130);
            const g = Math.round(40 + t * 30);
            const b = Math.round(210 - t * 60);
            return `rgba(${r}, ${g}, ${b}, ${0.5 + t * 0.5})`;
        };

        let frameId: number;
        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';

            const radius = Math.min(width, height) * 0.46;
            const cx = width / 2;
            const cy = height / 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const projected = points
                .map(({ x, y, z, size }) => {
                    const rx = x * cos - z * sin;
                    const rz = x * sin + z * cos;
                    const perspective = 1 / (2 - rz);
                    return {
                        px: cx + rx * radius * perspective,
                        py: cy + y * radius * perspective,
                        z: rz,
                        size: size * perspective,
                    };
                })
                .sort((a, b) => a.z - b.z);

            for (const p of projected) {
                ctx.beginPath();
                ctx.fillStyle = colorForDepth(p.z);
                ctx.arc(p.px, p.py, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            if (!prefersReducedMotion) {
                angle += 0.0022;
                frameId = requestAnimationFrame(draw);
            }
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            if (frameId) cancelAnimationFrame(frameId);
        };
    }, [pointCount]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className={className}
            style={{ display: 'block', width: '100%', height: '100%' }}
        />
    );
}
