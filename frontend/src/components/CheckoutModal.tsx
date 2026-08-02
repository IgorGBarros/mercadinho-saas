// components/CheckoutModal.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerName: string;
  onSubmit: (data: {
    name: string;
    phone: string;
    email?: string;
    birth_date?: string;
    whatsapp_opt_in: boolean;
  }) => Promise<void>;
  lgpdConfig?: {
    required: boolean;
    checkboxLabel: string;
    privacyPolicyLink: string;
    consentVersion: string;
  };
}

export default function CheckoutModal({ open, onOpenChange, sellerName, onSubmit, lgpdConfig }: CheckoutModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lgpdConfig?.required && !optIn) {
      alert("É necessário aceitar os termos para continuar.");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name,
        phone,
        email: email.trim() || undefined,
        birth_date: birthDate || undefined,
        whatsapp_opt_in: optIn,
      });
      onOpenChange(false);
      // Reset
      setName(""); setPhone(""); setEmail(""); setBirthDate(""); setOptIn(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar seu pedido</DialogTitle>
          <DialogDescription>
            Informe seus dados para receber atualizações da {sellerName} no WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ana Silva" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex: 71999999999" required />
            <p className="text-xs text-muted-foreground">Formato: apenas números com DDD</p>
          </div>

          {/* Opcionais: ajudam a consultora a personalizar o contato (ex.:
              mensagem de aniversário), mas não bloqueiam a compra se a
              cliente preferir não informar. */}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ex: ana@email.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth-date">Data de nascimento <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              id="birth-date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          
          {/* 🔹 LGPD: Opt-in explícito (desmarcado por padrão) */}
          {lgpdConfig && (
            <div className="flex items-start space-x-2 pt-2">
              <Checkbox id="optin" checked={optIn} onCheckedChange={(checked) => setOptIn(checked as boolean)} />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="optin" className="text-sm font-normal cursor-pointer">
                  {lgpdConfig.checkboxLabel}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Você pode cancelar a qualquer momento. <a href={lgpdConfig.privacyPolicyLink} target="_blank" className="underline">Política de Privacidade</a>
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading || !name || !phone || (lgpdConfig?.required && !optIn)}>
              {loading ? "Salvando..." : "Continuar para WhatsApp"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}