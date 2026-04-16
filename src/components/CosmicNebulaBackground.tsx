import { useEffect, useRef } from 'react';

const CosmicNebulaBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationId: number;
    let time = 0;
    let lastFrame = 0;
    const FPS = 24; // Lower FPS for background — saves CPU
    const frameInterval = 1000 / FPS;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };
    window.addEventListener('resize', debouncedResize);

    const starColors = [
      '100, 255, 170',
      '140, 255, 200',
      '80, 220, 140',
      '160, 255, 180',
    ];

    // Reduced star count for performance
    const stars: Array<{
      x: number; y: number; size: number;
      brightness: number; twinkleSpeed: number; color: string;
    }> = [];

    const w = window.innerWidth;
    const h = window.innerHeight;

    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 2 + 0.5,
        brightness: Math.random() * 0.5 + 0.3,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    // Reduced nebula clouds
    const nebulaColors = [
      { h: 174, s: 60, l: 35 },
      { h: 200, s: 55, l: 30 },
      { h: 280, s: 40, l: 25 },
      { h: 190, s: 50, l: 32 },
    ];

    const nebulaClouds: Array<{
      x: number; y: number; radius: number;
      color: { h: number; s: number; l: number }; phase: number;
    }> = [];

    for (let i = 0; i < 5; i++) {
      nebulaClouds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 400 + 200,
        color: nebulaColors[Math.floor(Math.random() * nebulaColors.length)],
        phase: Math.random() * Math.PI * 2,
      });
    }

    const shootingStars: Array<{
      x: number; y: number; length: number;
      speed: number; opacity: number; active: boolean;
    }> = [];

    const draw = (now: number) => {
      animationId = requestAnimationFrame(draw);

      // Pause when tab hidden
      if (document.hidden) return;

      // Throttle frame rate
      if (now - lastFrame < frameInterval) return;
      lastFrame = now;

      time += 0.016;
      const cw = canvas.width / (Math.min(window.devicePixelRatio, 1.5));
      const ch = canvas.height / (Math.min(window.devicePixelRatio, 1.5));

      // Background gradient
      const bgGradient = ctx.createRadialGradient(
        cw * 0.3, ch * 0.3, 0,
        cw * 0.5, ch * 0.5, ch
      );
      bgGradient.addColorStop(0, 'hsl(230, 25%, 6%)');
      bgGradient.addColorStop(0.4, 'hsl(225, 22%, 5%)');
      bgGradient.addColorStop(0.7, 'hsl(240, 20%, 4%)');
      bgGradient.addColorStop(1, 'hsl(250, 25%, 3%)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, cw, ch);

      // Nebula clouds
      for (let i = 0; i < nebulaClouds.length; i++) {
        const cloud = nebulaClouds[i];
        const wobbleX = Math.sin(time * 0.2 + cloud.phase) * 20;
        const wobbleY = Math.cos(time * 0.15 + cloud.phase) * 15;
        const breathe = Math.sin(time * 0.1 + cloud.phase) * 0.1 + 1;

        const gradient = ctx.createRadialGradient(
          cloud.x + wobbleX, cloud.y + wobbleY, 0,
          cloud.x + wobbleX, cloud.y + wobbleY, cloud.radius * breathe
        );
        gradient.addColorStop(0, `hsla(${cloud.color.h}, ${cloud.color.s}%, ${cloud.color.l}%, 0.08)`);
        gradient.addColorStop(0.3, `hsla(${cloud.color.h}, ${cloud.color.s}%, ${cloud.color.l}%, 0.04)`);
        gradient.addColorStop(0.6, `hsla(${cloud.color.h}, ${cloud.color.s}%, ${cloud.color.l - 5}%, 0.02)`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(cloud.x + wobbleX, cloud.y + wobbleY, cloud.radius * breathe, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Stars — batch draw
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const twinkle = Math.sin(time * star.twinkleSpeed * 60 + star.x) * 0.3 + 0.7;
        const finalBrightness = star.brightness * twinkle;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${star.color}, ${finalBrightness})`;
        ctx.fill();

        if (star.size > 1.5) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${star.color}, ${finalBrightness * 0.1})`;
          ctx.fill();
        }
      }

      // Shooting stars (rare)
      if (shootingStars.length < 2 && Math.random() < 0.002) {
        shootingStars.push({
          x: Math.random() * cw,
          y: Math.random() * ch * 0.3,
          length: Math.random() * 100 + 50,
          speed: Math.random() * 8 + 4,
          opacity: 1,
          active: true,
        });
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const star = shootingStars[i];
        if (!star.active) continue;
        star.x += star.speed * 1.5;
        star.y += star.speed;
        star.opacity -= 0.02;
        if (star.opacity <= 0 || star.x > cw || star.y > ch) {
          shootingStars.splice(i, 1);
          continue;
        }
        const gradient = ctx.createLinearGradient(
          star.x, star.y,
          star.x - star.length, star.y - star.length * 0.7
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${star.opacity})`);
        gradient.addColorStop(0.3, `rgba(220, 230, 255, ${star.opacity * 0.6})`);
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x - star.length, star.y - star.length * 0.7);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(star.x, star.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.fill();
      }

      // Central glow
      const centerGlow = ctx.createRadialGradient(
        cw * 0.4, ch * 0.3, 0,
        cw * 0.4, ch * 0.3, cw * 0.5
      );
      centerGlow.addColorStop(0, 'rgba(45, 212, 191, 0.03)');
      centerGlow.addColorStop(0.5, 'rgba(45, 212, 191, 0.01)');
      centerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, cw, ch);

      // Vignette
      const vignette = ctx.createRadialGradient(
        cw / 2, ch / 2, ch * 0.4,
        cw / 2, ch / 2, ch
      );
      vignette.addColorStop(0, 'transparent');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimer);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: 'hsl(230, 25%, 4%)' }}
    />
  );
};

export default CosmicNebulaBackground;
