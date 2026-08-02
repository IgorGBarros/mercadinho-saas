// src/components/pgba/PGBALogo.tsx - Logo responsivo
import React, { useState } from 'react';

interface PGBALogoProps {
  isDarkMode: boolean;
}

export const PGBALogo: React.FC<PGBALogoProps> = ({ isDarkMode }) => {
  const [isSpinning, setIsSpinning] = useState(false);

  const handleCubeClick = () => {
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 1200);
  };

  return (
    <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 md:gap-8 bg-white/85 dark:bg-slate-900/60 backdrop-blur-2xl border border-black/8 dark:border-white/10 px-6 py-8 md:px-16 md:py-12 rounded-2xl md:rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)] dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-500 mx-4 md:mx-0 max-w-sm md:max-w-none">
      <div 
        className={`animate-[floating_6s_ease-in-out_infinite] cursor-pointer transition-transform duration-300 hover:scale-105 ${
          isSpinning ? 'animate-[spin360_1.2s_cubic-bezier(0.64,0.04,0.35,1)_forwards]' : ''
        }`}
        onClick={handleCubeClick}
      >
        <svg
          viewBox="0 -5 50 70"
          width="70"
          height="85"
          className="md:w-[85px] md:h-[100px] drop-shadow-[0_4px_20px_rgba(59,130,246,0.25)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradientes profissionais corporativos */}
            <linearGradient id="pgba-blue-pro" x1="5" y1="5" x2="25" y2="55" gradientUnits="userSpaceOnUse">
              <stop stopColor={isDarkMode ? "#60a5fa" : "#3b82f6"} />
              <stop offset="0.5" stopColor={isDarkMode ? "#3b82f6" : "#2563eb"} />
              <stop offset="1" stopColor={isDarkMode ? "#1e40af" : "#1d4ed8"} />
            </linearGradient>
            
            <linearGradient id="pgba-purple-pro" x1="25" y1="55" x2="45" y2="5" gradientUnits="userSpaceOnUse">
              <stop stopColor={isDarkMode ? "#a78bfa" : "#8b5cf6"} />
              <stop offset="0.5" stopColor={isDarkMode ? "#8b5cf6" : "#7c3aed"} />
              <stop offset="1" stopColor={isDarkMode ? "#7c3aed" : "#6d28d9"} />
            </linearGradient>

            <linearGradient id="pgba-top-pro" x1="5" y1="16" x2="45" y2="16" gradientUnits="userSpaceOnUse">
              <stop stopColor={isDarkMode ? "#38bdf8" : "#0ea5e9"} />
              <stop offset="0.5" stopColor={isDarkMode ? "#0ea5e9" : "#0284c7"} />
              <stop offset="1" stopColor={isDarkMode ? "#0284c7" : "#0369a1"} />
            </linearGradient>

            {/* Sombras internas para profundidade */}
            <linearGradient id="shadow-blue" x1="5" y1="5" x2="25" y2="55" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
            </linearGradient>

            <linearGradient id="shadow-purple" x1="25" y1="55" x2="45" y2="5" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
            </linearGradient>

            {/* Filtro de brilho sutil */}
            <filter id="professional-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Faces do Cubo - Formato original com gradientes profissionais */}
          
          {/* Face esquerda (azul) */}
          <path 
            d="M 25 5 L 5 16 L 5 44 L 25 55 L 25 30 Z" 
            fill="url(#pgba-blue-pro)" 
            opacity="0.95"
          />
          
          {/* Sombra interna da face esquerda */}
          <path 
            d="M 25 5 L 5 16 L 5 44 L 25 55 L 25 30 Z" 
            fill="url(#shadow-blue)" 
          />
          
          {/* Face direita (roxa) */}
          <path 
            d="M 25 55 L 45 44 L 45 16 L 25 5 L 25 30 Z" 
            fill="url(#pgba-purple-pro)" 
            style={{ mixBlendMode: 'multiply' }} 
            opacity="0.85"
          />
          
          {/* Sombra interna da face direita */}
          <path 
            d="M 25 55 L 45 44 L 45 16 L 25 5 L 25 30 Z" 
            fill="url(#shadow-purple)" 
          />
          
          {/* Face superior (azul claro) */}
          <path 
            d="M 5 16 L 25 5 L 45 16 L 25 27 Z" 
            fill="url(#pgba-top-pro)" 
            opacity="0.8"
          />

          {/* Bordas de destaque profissionais */}
          <line x1="25" y1="5" x2="5" y2="16" 
                stroke="rgba(255,255,255,0.4)" 
                strokeWidth="0.8" 
                filter="url(#professional-glow)" />
          
          <line x1="25" y1="5" x2="45" y2="16" 
                stroke="rgba(255,255,255,0.4)" 
                strokeWidth="0.8" 
                filter="url(#professional-glow)" />
          
          <line x1="25" y1="30" x2="25" y2="55" 
                stroke="rgba(255,255,255,0.3)" 
                strokeWidth="0.6" />

          {/* Conexões originais com estilo profissional */}
          <line x1="12" y1="19" x2="25" y2="27" 
                stroke="rgba(255,255,255,0.8)" 
                strokeWidth="1.2" 
                strokeOpacity="0.9" 
                strokeDasharray="3 1.5" 
                className="animate-[dash_2s_linear_infinite]" />
          
          <line x1="38" y1="40" x2="25" y2="27" 
                stroke="rgba(255,255,255,0.8)" 
                strokeWidth="1.2" 
                strokeOpacity="0.9" 
                strokeDasharray="3 1.5" 
                className="animate-[dash_2s_linear_infinite] [animation-delay:0.5s]" />
          
          <line x1="25" y1="27" x2="25" y2="48" 
                stroke="rgba(255,255,255,0.6)" 
                strokeWidth="1" 
                strokeOpacity="0.7" 
                strokeDasharray="2 2" />

          {/* BOLINHAS ANIMADAS EM 3D - Responsivas */}
          
          {/* Bolinha 1 - Movimento orbital no eixo XY */}
          <circle r="2.2" 
                  fill="rgba(255,255,255,0.95)" 
                  stroke={isDarkMode ? "#60a5fa" : "#3b82f6"}
                  strokeWidth="0.5"
                  opacity="0.9"
                  filter="url(#professional-glow)"
                  className="animate-[orbit-xy_4s_ease-in-out_infinite] md:block hidden">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="12 19; 18 22; 25 27; 32 32; 25 37; 18 32; 12 19"
              dur="4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="2.2; 3; 2.2; 1.8; 2.2; 3; 2.2"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          
          {/* Bolinha 2 - Movimento em Z simulado */}
          <circle r="2.2" 
                  fill="rgba(255,255,255,0.95)" 
                  stroke={isDarkMode ? "#a78bfa" : "#8b5cf6"}
                  strokeWidth="0.5"
                  opacity="0.9"
                  filter="url(#professional-glow)"
                  className="animate-[orbit-z_5s_ease-in-out_infinite] md:block hidden">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="38 40; 35 35; 30 30; 25 27; 30 24; 35 29; 38 40"
              dur="5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="2.2; 1.5; 1; 2.8; 3.2; 2.8; 2.2"
              dur="5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.9; 0.6; 0.4; 1; 1; 0.8; 0.9"
              dur="5s"
              repeatCount="indefinite"
            />
          </circle>
          
          {/* Núcleo central - Sempre visível */}
          <circle r="3.2" 
                  fill="rgba(255,255,255,0.98)" 
                  stroke={isDarkMode ? "#38bdf8" : "#0ea5e9"}
                  strokeWidth="0.8"
                  filter="url(#professional-glow)"
                  className="animate-[core-3d_6s_ease-in-out_infinite]">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="25 27; 26 26; 25 25; 24 26; 25 27; 26 28; 25 27"
              dur="6s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="3.2; 3.8; 3.2; 2.8; 3.2; 3.6; 3.2"
              dur="6s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Partículas extras - Apenas desktop */}
          <circle r="1" 
                  fill={isDarkMode ? "#60a5fa" : "#3b82f6"} 
                  opacity="0.7"
                  className="animate-[particle-float-1_3s_ease-in-out_infinite] md:block hidden">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="15 25; 20 20; 25 25; 30 30; 25 35; 20 30; 15 25"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.7; 1; 0.5; 0.8; 0.6; 1; 0.7"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>

          <circle r="0.8" 
                  fill={isDarkMode ? "#a78bfa" : "#8b5cf6"} 
                  opacity="0.6"
                  className="animate-[particle-float-2_4.5s_ease-in-out_infinite] md:block hidden">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="35 35; 30 40; 25 45; 20 40; 25 35; 30 30; 35 35"
              dur="4.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="0.8; 1.2; 0.8; 0.5; 0.8; 1; 0.8"
              dur="4.5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Detalhes internos do núcleo */}
          <circle cx="25" cy="27" r="1.5" 
                  fill={isDarkMode ? "#60a5fa" : "#3b82f6"} 
                  opacity="0.6"
                  className="animate-[core-inner_2s_ease-in-out_infinite]" />
        </svg>
      </div>
      
      <div className="flex flex-col md:border-l-2 border-black/8 dark:border-white/10 md:pl-8 transition-colors duration-500 text-center md:text-left">
        <h1 className="text-3xl md:text-5xl font-medium text-slate-900 dark:text-white tracking-[2px] m-0 leading-[0.95] transition-colors duration-500">
          PGBA<span className="text-sky-500 font-bold drop-shadow-[0_0_10px_rgba(14,165,233,0.3)]">.</span>
        </h1>
        <span className="text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-[2px] md:tracking-[3.5px] mt-2 transition-colors duration-500">
          Data, AI & Tech Solutions
        </span>
      </div>
    </div>
  );
};