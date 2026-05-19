type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfPageTextContent = {
  items: PdfTextItem[];
};

type ExtractedPdfPage = {
  pageNumber: number;
  text: string;
  ocrText: string;
  elements: {
    text: string;
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
  }[];
};

export type ExtractedPdfDocument = {
  text: string;
  pages: ExtractedPdfPage[];
  usedOcr: boolean;
};

function normalizeText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]{3,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function extractNativeText(buffer: Buffer) {
  const { definePDFJSModule, extractText } = await import("unpdf");
  await definePDFJSModule(() => import("pdfjs-dist"));
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
  return Array.isArray(text) ? text.map(normalizeText) : [normalizeText(text)];
}

async function loadPdf(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  return task.promise;
}

async function renderPageToPng(page: { getViewport: Function; render: Function }, scale = 2) {
  const importRuntime = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("@napi-rs/canvas")>;
  const { createCanvas } = await importRuntime("@napi-rs/canvas");
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext("2d");

  await page.render({ canvasContext, viewport }).promise;
  return canvas.toBuffer("image/png");
}

async function ocrImage(image: Buffer) {
  const importRuntime = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<any>;
  const { createWorker } = await importRuntime("tesseract.js");
  const worker = await createWorker("eng");
  const result = await worker.recognize(image);
  const text = normalizeText(result.data.text ?? "");
  await worker.terminate();
  return text;
}

export async function extractPdfDocument(buffer: Buffer): Promise<ExtractedPdfDocument> {
  const nativePages = await extractNativeText(buffer).catch(() => []);
  const pdf = await loadPdf(buffer);
  const pages: ExtractedPdfPage[] = [];
  let usedOcr = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = (await page.getTextContent()) as PdfPageTextContent;
    const elements = content.items
      .map((item) => {
        const text = normalizeText(item.str ?? "");
        const transform = item.transform ?? [];
        return {
          text,
          x: typeof transform[4] === "number" ? transform[4] : null,
          y: typeof transform[5] === "number" ? transform[5] : null,
          width: typeof item.width === "number" ? item.width : null,
          height: typeof item.height === "number" ? item.height : null,
        };
      })
      .filter((item) => item.text.length > 0);

    const nativeText = normalizeText(
      nativePages[pageNumber - 1] || elements.map((item) => item.text).join(" "),
    );
    let ocrText = "";

    if (nativeText.length < 40 || elements.length < 3) {
      usedOcr = true;
      const image = await renderPageToPng(page);
      ocrText = await ocrImage(image);
    }

    pages.push({
      pageNumber,
      text: nativeText,
      ocrText,
      elements,
    });
  }

  const text = normalizeText(
    pages
      .map((page) => {
        const pageText = page.text || page.ocrText;
        const elementText = page.elements
          .map((element) => `- ${element.text}`)
          .join("\n");

        return [
          `--- Page ${page.pageNumber} ---`,
          pageText,
          page.ocrText && page.ocrText !== pageText ? `OCR fallback:\n${page.ocrText}` : "",
          elementText ? `Layout text elements:\n${elementText}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n"),
  );

  return { text, pages, usedOcr };
}
