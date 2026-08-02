// components/AdminThemeTab.tsx

import { useState, useEffect } from 'react';
import { Palette, Save, RotateCcw, Loader2, Eye } from 'lucide-react';
import { adminThemeApi, ThemeConfig } from '../lib/api';
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular
import { useTheme } from '../contexts/ThemeContext';

interface ColorField {
  key: keyof ThemeConfig;
  label: string;
  description: string;
}

const COLOR_FIELDS: ColorField[] = [
  { key: 'color_primary', label: 'Cor Principal (CTA)', description: 'Botões de ação, ícones de destaque' },
  { key: 'color_primary_light', label: 'Rosa Blush (Fundo)', description: 'Background de cards e inputs' },
  { key: 'color_success', label: 'Verde Sucesso', description: 'Scanner OCR, indicadores de lucro' },
  { key: 'color_text', label: 'Texto Principal', description: 'Cor do texto para máximo contraste' },
  { key: 'color_accent', label: 'Acento / Gradiente', description: 'Cor secundária para gradientes' },
  { key: 'color_destructive', label: 'Erro / Alerta', description: 'Estoque baixo, erros' },
  { key: 'color_warning', label: 'Aviso', description: 'Alertas de validade' },
  { key: 'color_background', label: 'Fundo Geral', description: 'Background da página' },
  { key: 'color_card', label: 'Fundo dos Cards', description: 'Background dos componentes' },
  { key: 'color_border', label: 'Bordas', description: 'Cor das bordas e separadores' },
];

const DEFAULT_PALETTE: Partial<ThemeConfig> = {
  color_primary: '#871745',
  color_primary_light: '#FDF2F7',
  color_success: '#871745',
  color_text: '#2D292E',
  color_accent: '#A91B60',
  color_destructive: '#DC2626',
  color_warning: '#F59E0B',
  color_background: '#FFFFFF',
  color_card: '#FFFFFF',
  color_border: '#E5E7EB',
};

export default function AdminThemeTab() {
  const { toast } = useToast();
  const { refreshTheme } = useTheme();
  const [formData, setFormData] = useState<Partial<ThemeConfig>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const data = await adminThemeApi.get();
      setFormData(data);
    } catch {
      setFormData(DEFAULT_PALETTE);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminThemeApi.update(formData);
      await refreshTheme(); // Atualiza o tema globalmente
      toast({ title: '✅ Tema atualizado!', description: 'As cores foram aplicadas em todo o sistema.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: 'Falha ao salvar tema', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData(DEFAULT_PALETTE);
    toast({ title: 'Paleta restaurada', description: 'Clique em Salvar para aplicar.' });
  };

  const handleColorChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Personalização Visual
          </h2>
          <p className="text-muted-foreground">Configure as cores do sistema em tempo real</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Tema
          </button>
        </div>
      </div>

      {/* Nome do App */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Identidade</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome do Aplicativo</label>
            <input
              type="text"
              value={formData.app_name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, app_name: e.target.value }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              placeholder="Minha Amora"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL do Logo (opcional)</label>
            <input
              type="url"
              value={formData.logo_url || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, logo_url: e.target.value || null }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Grid de Cores */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Paleta de Cores</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {COLOR_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
              <div className="relative">
                <input
                  type="color"
                  value={(formData[key] as string) || '#000000'}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="h-12 w-12 rounded-lg border-2 border-border cursor-pointer"
                  style={{ padding: 0 }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{description}</p>
                <code className="text-[10px] font-mono text-muted-foreground">
                  {(formData[key] as string) || '—'}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Preview
        </h3>
        <div
          className="rounded-xl p-6 space-y-4"
          style={{ backgroundColor: formData.color_background || '#FFF' }}
        >
          {/* Botão primário */}
          <div className="flex gap-3 flex-wrap">
            <button
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md"
              style={{ backgroundColor: formData.color_primary || '#871745' }}
            >
              Botão Principal
            </button>
            <button
              className="px-6 py-2.5 rounded-xl text-sm font-bold border-2"
              style={{
                borderColor: formData.color_primary || '#871745',
                color: formData.color_primary || '#871745',
              }}
            >
              Botão Secundário
            </button>
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: formData.color_success || '#871745' }}
            >
              +R$ 150,00
            </span>
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: formData.color_destructive || '#DC2626' }}
            >
              Estoque Baixo
            </span>
          </div>

          {/* Card preview */}
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{
              backgroundColor: formData.color_card || '#FFF',
              borderColor: formData.color_border || '#E5E7EB',
              borderWidth: 1,
              borderStyle: 'solid',
            }}
          >
            <p className="text-sm font-bold" style={{ color: formData.color_text || '#2D292E' }}>
              Card de Exemplo
            </p>
            <p className="text-xs mt-1" style={{ color: formData.color_text || '#2D292E', opacity: 0.6 }}>
              Assim ficará a interface com essas cores
            </p>
            <div
              className="mt-3 rounded-lg p-3"
              style={{ backgroundColor: formData.color_primary_light || '#FDF2F7' }}
            >
              <p className="text-xs font-medium" style={{ color: formData.color_primary || '#871745' }}>
                Área de destaque com fundo suave
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}