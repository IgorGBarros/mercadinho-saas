// src/components/pgba/PGBACanvas.tsx - Canvas responsivo
import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: number;
}

interface PGBACanvasProps {
  isDarkMode: boolean;
}

export const PGBACanvas: React.FC<PGBACanvasProps> = ({ isDarkMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvasSize = () => {
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        // Mobile: Canvas ocupa toda a tela como fundo
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      } else {
        // Desktop: Canvas apenas no canto esquerdo
        canvas.width = window.innerWidth * 0.4;
        canvas.height = window.innerHeight;
      }
    };

    updateCanvasSize();

    const resizeCanvas = () => {
      updateCanvasSize();
      
      // Reposiciona partículas se necessário
      particlesRef.current.forEach(particle => {
        if (particle.x > canvas.width) particle.x = canvas.width - 50;
        if (particle.y > canvas.height) particle.y = canvas.height - 50;
      });
    };

    // Configurações responsivas
    const isMobile = window.innerWidth < 768;
    const numParticles = isMobile ? 40 : 60; // Menos partículas no mobile
    const connectionDistance = isMobile ? 120 : 180;
    
    particlesRef.current = Array.from({ length: numParticles }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * (isMobile ? 0.2 : 0.3), // Movimento mais lento no mobile
      vy: (Math.random() - 0.5) * (isMobile ? 0.2 : 0.3),
      radius: Math.random() * (isMobile ? 1.2 : 1.5) + (isMobile ? 0.8 : 1), // Partículas menores no mobile
      type: Math.random() > 0.5 ? 1 : 2,
    }));

    const getParticleColor = (type: number) => {
      if (isDarkMode) {
        return type === 1 ? '#38bdf8' : '#c026d3';
      } else {
        return type === 1 ? '#0066ff' : '#cc0099';
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particlesRef.current.forEach((particle, i) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        if (particle.x < 0 || particle.x > canvas.width) {
          particle.vx *= -1;
          particle.x = Math.max(0, Math.min(canvas.width, particle.x));
        }
        if (particle.y < 0 || particle.y > canvas.height) {
          particle.vy *= -1;
          particle.y = Math.max(0, Math.min(canvas.height, particle.y));
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = getParticleColor(particle.type);
        ctx.shadowBlur = isDarkMode ? (isMobile ? 6 : 8) : (isMobile ? 10 : 15);
        ctx.shadowColor = getParticleColor(particle.type);
        ctx.fill();

        // Draw connections
        particlesRef.current.slice(i + 1).forEach((otherParticle) => {
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < connectionDistance) {
            ctx.beginPath();
            const opacity = 1 - (distance / connectionDistance);
            
            let rgbLine, lineOpacity;
            if (isDarkMode) {
              rgbLine = '139, 92, 246';
              lineOpacity = opacity * 0.6;
            } else {
              rgbLine = particle.type === 1 ? '0, 102, 255' : '204, 0, 153';
              lineOpacity = opacity * 0.8;
            }
            
            ctx.strokeStyle = `rgba(${rgbLine}, ${lineOpacity})`;
            ctx.lineWidth = opacity > 0.7 ? (isMobile ? 1.5 : 2) : (isMobile ? 1 : 1.5);
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            
            if (!isDarkMode) {
              ctx.shadowBlur = isMobile ? 3 : 5;
              ctx.shadowColor = `rgba(${rgbLine}, 0.4)`;
            }
            
            ctx.stroke();
            
            if (opacity > 0.8) {
              if (isDarkMode) {
                ctx.strokeStyle = `rgba(139, 92, 246, ${opacity * 0.2})`;
                ctx.lineWidth = isMobile ? 1.5 : 2;
              } else {
                ctx.strokeStyle = `rgba(${rgbLine}, ${opacity * 0.3})`;
                ctx.lineWidth = isMobile ? 2 : 2.5;
                ctx.shadowBlur = isMobile ? 6 : 8;
              }
              ctx.stroke();
            }
          }
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDarkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 z-[1] md:w-[40%] w-full h-full"
    />
  );
};