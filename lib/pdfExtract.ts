/**
 * Client-side PDF handling using PDF.js (pdfjs-dist 3.11.174).
 * - extractPdfText: extracts selectable text layer
 * - renderPdfPagesAsImages: renders pages to JPEG for scanned/image PDFs
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsModule: any = null;

async function getPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  pdfjsModule = await import('pdfjs-dist');
  pdfjsModule.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  return pdfjsModule;
}

// ── Text extraction ────────────────────────────────────────────────────────────

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), verbosity: 0 }).promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let pageText = '';

    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = item as any;
      if (!('str' in i) || !i.str) continue;
      const y = i.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith(' ') && !i.str.startsWith(' ')) {
        pageText += ' ';
      }
      pageText += i.str;
      if (y !== null) lastY = y;
    }

    if (pageText.trim()) {
      pageTexts.push(`[Page ${pageNum}/${pdf.numPages}]\n${pageText.trim()}`);
    }
  }

  return pageTexts.join('\n\n');
}

// ── Image rendering (for scanned / image-only PDFs) ───────────────────────────

export interface PdfPageImage {
  base64: string;
  mimeType: 'image/jpeg';
  pageNum: number;
  totalPages: number;
}

/**
 * Renders each PDF page to a JPEG image via canvas.
 * Limits to maxPages to avoid huge payloads.
 */
export async function renderPdfPagesAsImages(
  file: File,
  maxPages = 5
): Promise<PdfPageImage[]> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), verbosity: 0 }).promise;

  const pagesToRender = Math.min(pdf.numPages, maxPages);
  const images: PdfPageImage[] = [];

  for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Scale so the longest side is ≤1024px (good for vision models, smaller payload)
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1024 / baseViewport.width, 1024 / baseViewport.height, 1.5);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // White background (so transparent areas don't render as black in JPEG)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const base64 = dataUrl.split(',')[1];

    images.push({ base64, mimeType: 'image/jpeg', pageNum, totalPages: pdf.numPages });
  }

  return images;
}

/**
 * Smart PDF processor:
 * 1. Tries text extraction first.
 * 2. If the text is sparse (< 50 chars/page average), falls back to image rendering.
 * Returns { text, images, mode }
 */
export async function processPdf(
  file: File
): Promise<{ text: string | null; images: PdfPageImage[]; mode: 'text' | 'image' | 'both' }> {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), verbosity: 0 }).promise;
  const numPages = pdf.numPages;

  // Try text
  let extractedText = '';
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    let lastY: number | null = null;
    let pageText = '';
    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = item as any;
      if (!('str' in i) || !i.str) continue;
      const y = i.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) pageText += '\n';
      else if (pageText.length > 0 && !pageText.endsWith(' ') && !i.str.startsWith(' ')) pageText += ' ';
      pageText += i.str;
      if (y !== null) lastY = y;
    }
    if (pageText.trim()) pageTexts.push(`[Page ${pageNum}/${numPages}]\n${pageText.trim()}`);
  }

  extractedText = pageTexts.join('\n\n');

  const avgCharsPerPage = extractedText.length / numPages;
  const isScanned = avgCharsPerPage < 50; // likely image-only

  if (isScanned) {
    // Render pages as images for the AI to see
    const images = await renderPdfPagesAsImages(file, 5);
    return { text: null, images, mode: 'image' };
  }

  return { text: extractedText, images: [], mode: 'text' };
}
