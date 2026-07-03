/**
 * Client-side PDF text extraction using PDF.js (pdfjs-dist).
 * Runs entirely in the browser — no server call needed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsModule: any = null;

async function getPdfjs() {
  if (pdfjsModule) return pdfjsModule;

  // Dynamic import so this never runs on the server
  pdfjsModule = await import('pdfjs-dist');

  // Point the worker at the matching version on unpkg CDN
  // (avoids webpack bundling the worker, which causes issues in Next.js)
  pdfjsModule.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

  return pdfjsModule;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfjs();

  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    // Suppress CMap / font warnings that are non-fatal
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Combine text items, preserving line breaks roughly
    let lastY: number | null = null;
    let pageText = '';

    for (const item of textContent.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = item as any;
      if (!('str' in i)) continue;

      const y = i.transform?.[5] ?? null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith(' ') && i.str && !i.str.startsWith(' ')) {
        pageText += ' ';
      }

      pageText += i.str;
      if (y !== null) lastY = y;
    }

    if (pageText.trim()) {
      pageTexts.push(`[Page ${pageNum}/${pageCount}]\n${pageText.trim()}`);
    }
  }

  const fullText = pageTexts.join('\n\n');

  if (!fullText.trim()) {
    throw new Error(
      'No text could be extracted. This PDF may be scanned (image-only). ' +
      'Try copying the text manually from the PDF.'
    );
  }

  return fullText;
}
