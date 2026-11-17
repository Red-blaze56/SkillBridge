import fs from 'node:fs/promises'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface ExtractedPdf {
  text: string
  pageCount: number
}

export class PdfExtractionError extends Error {
  statusCode = 422
}

export async function extractPdfText(filePath: string): Promise<ExtractedPdf> {
  try {
    const data = new Uint8Array(await fs.readFile(filePath))
    const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false })
    const document = await loadingTask.promise
    try {
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ')
        pages.push(pageText)
      }
      const text = pages.join('\n').replace(/\s+/g, ' ').trim()
      if (!text) throw new PdfExtractionError('The PDF does not contain readable text')
      return { text, pageCount: document.numPages }
    } finally {
      await loadingTask.destroy()
    }
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error
    throw new PdfExtractionError('Could not extract readable text from the PDF')
  }
}
