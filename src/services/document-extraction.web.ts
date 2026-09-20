import { File } from 'expo-file-system';
import * as mammoth from 'mammoth';

const MAX_EXTRACTED_CHARS = 12000;

function extensionFor(name: string, mimeType?: string | null) {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' || extension === 'docx' || extension === 'txt' || extension === 'json' || extension === 'xml') {
    return extension;
  }
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return 'text';
}

function limitText(text: string) {
  const normalized = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  return normalized.slice(0, MAX_EXTRACTED_CHARS);
}

async function extractPdfText(bytes: Uint8Array) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as typeof import('pdfjs-dist');
  const document = await pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }

  const text = limitText(pages.join('\n\n'));
  if (!text) throw new Error('This PDF has no selectable text. Scanned/image-only PDFs need OCR support.');
  return text;
}

export async function extractDocumentText(uri: string, name: string, mimeType?: string | null) {
  const file = new File(uri);
  const extension = extensionFor(name, mimeType);

  if (extension === 'pdf') return extractPdfText(await file.bytes());
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = limitText(result.value);
    if (!text) throw new Error('This DOCX file does not contain readable text.');
    return text;
  }

  return limitText(await file.text());
}

export const MAX_DOCUMENT_CHARS = MAX_EXTRACTED_CHARS;
