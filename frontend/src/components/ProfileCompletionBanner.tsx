import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X, UserCircle } from "lucide-react";
import { profileApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export default function ProfileCompletionBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [missing, setMissing] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Don't show for demo user
    if (user.id === "demo") return;

    const dismissedAt = localStorage.getItem("profile_banner_dismissed");
    if (dismissedAt) {
      const diff = Date.now() - parseInt(dismissedAt, 10);
      // Re-show after 24h
      if (diff < 24 * 60 * 60 * 1000) {
        setDismissed(true);
        return;
      }
    }

    profileApi.get().then((data) => {
      const fields: string[] = [];
      if (!data.display_name) fields.push("Nome");
      if (!data.whatsapp_number) fields.push("WhatsApp");
      setMissing(fields);
    }).catch(() => {});
  }, [user]);

  if (dismissed || missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 flex items-center gap-3">
      <UserCircle className="h-5 w-5 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">Complete seu perfil</p>
        <p className="text-[10px] text-muted-foreground">
          Falta preencher: {missing.join(", ")}
        </p>
      </div>
      <button
        onClick={() => navigate("/profile")}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
      >
        Completar
      </button>
      <button
        onClick={() => {
          setDismissed(true);
          localStorage.setItem("profile_banner_dismissed", String(Date.now()));
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
