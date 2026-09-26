import { useEffect, useRef } from 'react';

/**
 * A rotating sphere made of glowing points, meant as a full-bleed ambient
 * background. Points near the cursor swirl and displace outward around it
 * — a localized vortex/ripple effect, not the sphere as a whole turning to
 * face the mouse.
 *
 * Pure Canvas 2D + vanilla math — no three.js or other 3D library.
 * Additive blending (`globalCompositeOperation = 'lighter'`) is what
 * creates the glow — overlapping points brighten each other instead of
 * just stacking flatly.
 *
 * ASSUMPTION: this treats the canvas as covering the full viewport
 * (rendered with something like `className="fixed inset-0"`), so mouse
 * position is read directly from `clientX`/`clientY` without adjusting for
 * the canvas's own offset. If it's ever used inside a smaller, scrollable
 * container instead, the mouse coordinates below need to subtract that
 * container's `getBoundingClientRect()` offset.
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

            const sizeSeed = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            const size = 0.9 + Math.abs(sizeSeed) * 1.8;

            return { x, y, z, size };
        });

        let angle = 0;

        // Raw + eased mouse position. Easing (a per-frame lerp toward the raw
        // target) keeps the swirl's origin smooth even if the mouse jumps
        // around quickly. `null` means the mouse hasn't moved yet, or has left
        // the window — the swirl simply doesn't apply.
        let rawMouseX: number | null = null;
        let rawMouseY: number | null = null;
        let mouseX = 0;
        let mouseY = 0;
        const MOUSE_EASE = 0.2;

        const onPointerMove = (e: PointerEvent) => {
            rawMouseX = e.clientX;
            rawMouseY = e.clientY;
        };
        const onPointerLeave = () => {
            rawMouseX = null;
            rawMouseY = null;
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerleave', onPointerLeave);
        window.addEventListener('mouseout', (e) => {
            if (!e.relatedTarget) onPointerLeave();
        });

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

        const colorForDepth = (z: number) => {
            const t = (z + 1) / 2;
            const r = Math.round(120 + t * 130);
            const g = Math.round(40 + t * 30);
            const b = Math.round(210 - t * 60);
            return `rgba(${r}, ${g}, ${b}, ${0.5 + t * 0.5})`;
        };

        // How far a point's influence reaches, and how strong the swirl/push
        // is right at the cursor (both fade to 0 at INFLUENCE_RADIUS).
        const INFLUENCE_RADIUS = 170;
        const SWIRL_RADIANS = 1.1;
        const PUSH_PX = 30;

        let frameId: number;
        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';

            angle += prefersReducedMotion ? 0 : 0.0022;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            if (rawMouseX !== null && rawMouseY !== null) {
                mouseX += (rawMouseX - mouseX) * MOUSE_EASE;
                mouseY += (rawMouseY - mouseY) * MOUSE_EASE;
            }
            const swirlActive = rawMouseX !== null;

            const radius = Math.min(width, height) * 0.46;
            const cx = width / 2;
            const cy = height / 2;

            const projected = points.map(({ x, y, z, size }) => {
                const rx = x * cos - z * sin;
                const rz = x * sin + z * cos;
                const perspective = 1 / (2 - rz);

                let px = cx + rx * radius * perspective;
                let py = cy + y * radius * perspective;

                if (swirlActive) {
                    const dx = px - mouseX;
                    const dy = py - mouseY;
                    const dist = Math.hypot(dx, dy);
                    if (dist < INFLUENCE_RADIUS) {
                        // 0 at the influence edge, 1 right at the cursor, eased
                        // (smoothstep) so the effect doesn't have a hard boundary.
                        const t = 1 - dist / INFLUENCE_RADIUS;
                        const falloff = t * t * (3 - 2 * t);

                        // Rotate this point around the cursor by the swirl angle...
                        const swirlAngle = falloff * SWIRL_RADIANS;
                        const cosA = Math.cos(swirlAngle);
                        const sinA = Math.sin(swirlAngle);
                        const ndx = dx * cosA - dy * sinA;
                        const ndy = dx * sinA + dy * cosA;

                        // ...then push it outward along that new direction, so points
                        // part around the cursor instead of just spinning in place.
                        const len = Math.max(dist, 0.001);
                        const push = falloff * PUSH_PX;
                        px = mouseX + ndx + (ndx / len) * push;
                        py = mouseY + ndy + (ndy / len) * push;
                    }
                }

                return { px, py, z: rz, size: size * perspective };
            });

            projected.sort((a, b) => a.z - b.z);

            for (const p of projected) {
                ctx.beginPath();
                ctx.fillStyle = colorForDepth(p.z);
                ctx.arc(p.px, p.py, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            frameId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerleave', onPointerLeave);
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