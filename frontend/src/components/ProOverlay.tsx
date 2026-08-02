import { Lock } from "lucide-react";

interface ProOverlayProps {
  message?: string;
  onClick?: () => void;
}

/** Blurred overlay for PRO-gated content sections (e.g. dashboard charts) */
export default function ProOverlay({ message = "Disponível no PRO", onClick }: ProOverlayProps) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-card/80 backdrop-blur-sm cursor-pointer"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 mb-2">
        <Lock className="h-6 w-6 text-accent-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">{message}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Toque para saber mais</p>
    </div>
  );
}
