// src/components/api/CodeExample.tsx
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeExampleProps {
  language: 'bash' | 'python' | 'javascript' | 'php' | 'curl';
  code: string;
}

const languageLabels: Record<CodeExampleProps['language'], string> = {
  bash: 'Bash',
  python: 'Python',
  javascript: 'JavaScript',
  php: 'PHP',
  curl: 'cURL',
};

export default function CodeExample({ language, code }: CodeExampleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="flex items-center justify-between bg-secondary/50 px-4 py-2 rounded-t-lg border border-border">
        <span className="text-xs font-mono text-muted-foreground">
          {languageLabels[language]}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-xs"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1 text-green-500" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </>
          )}
        </Button>
      </div>
      <pre className="bg-card border border-t-0 border-border rounded-b-lg p-4 overflow-x-auto">
        <code className="text-sm font-mono text-foreground whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}