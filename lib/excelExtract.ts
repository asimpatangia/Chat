/**
 * Client-side Excel / CSV extraction using SheetJS (xlsx).
 * Returns all sheets as labeled CSV blocks.
 */

export async function extractExcelText(file: File): Promise<string> {
  // Dynamic import so xlsx is only loaded when needed
  const XLSX = await import('xlsx');

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const sheetTexts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      sheetTexts.push(`[Sheet: ${sheetName}]\n${csv}`);
    }
  }

  if (sheetTexts.length === 0) {
    throw new Error('The spreadsheet appears to be empty');
  }

  return sheetTexts.join('\n\n');
}
