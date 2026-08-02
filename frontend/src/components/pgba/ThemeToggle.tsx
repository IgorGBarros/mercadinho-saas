// src/components/pgba/ThemeToggle.tsx - Botão responsivo
import React from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDarkMode, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className="absolute top-4 right-4 md:top-8 md:right-8 bg-white/85 dark:bg-slate-900/60 text-slate-900 dark:text-white border border-black/8 dark:border-white/10 px-3 py-2 md:px-5 md:py-2.5 rounded-full cursor-pointer font-outfit font-semibold text-xs md:text-sm z-[100] backdrop-blur-lg transition-all duration-300 hover:scale-105 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.08)] dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center gap-1 md:gap-2">
        {isDarkMode ? <Sun size={14} className="md:w-4 md:h-4" /> : <Moon size={14} className="md:w-4 md:h-4" />}
        <span className="hidden sm:inline">Alternar Tema</span>
        <span className="sm:hidden">Tema</span>
      </div>
    </button>
  );
};