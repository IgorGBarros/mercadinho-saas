import { createWorker } from 'tesseract.js';

interface OCRResult {
  date?: string;
  batch?: string;
  text: string;
}

export const processImageForData = async (imageSrc: string): Promise<OCRResult> => {
  console.log("Iniciando OCR Worker...");
  
  try {
    const worker = await createWorker('eng');
    
    // Configura para ler apenas letras maiúsculas, números e pontuação
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.: ',
    });

    const { data: { text } } = await worker.recognize(imageSrc);
    
    console.log("Texto Bruto:", text);
    
    await worker.terminate(); // Limpa memória

    const result: OCRResult = { text };

    // --- CORREÇÃO DE DATA ---
    // Procura por XX/XX (mês/ano)
    // Substitui S por 5, O por 0, l por 1 antes de validar
    const cleanText = text.replace(/S/g, '5').replace(/O/g, '0').replace(/l/g, '1');
    
    let datePattern = /(?:EXP|VAL)[\s\.]*(\d{2})\/(\d{2})/i;
    let dateMatch = cleanText.match(datePattern);
    
    if (!dateMatch) {
        dateMatch = cleanText.match(/(\d{2})\/(\d{2})/);
    }

    if (dateMatch) {
        let month = dateMatch[1];
        let year = dateMatch[2];
        
        // Validação: Mês 01-12
        if (parseInt(month) >= 1 && parseInt(month) <= 12) {
             result.date = `20${year}-${month}-01`; 
        }
    }

    // --- CORREÇÃO DE LOTE ---
    const batchMatch = text.match(/(?:L\.|L:|LOTE)[:\.\s]*([A-Z0-9]+)/i);
    if (batchMatch) {
        result.batch = batchMatch[1].replace(/[^A-Z0-9]/g, '');
    }

    return result;

  } catch (err) {
    console.error("Erro OCR:", err);
    return { text: "" };
  }
};