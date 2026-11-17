import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { PdfExtractionError } from '../services/pdfExtractionService.js'
import { UploadValidationError } from './uploadMiddleware.js'

export function notFound(request: Request, response: Response): void {
  response.status(404).json({
    error: 'Route not found',
    path: request.originalUrl,
  })
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 5 MB or smaller' : error.message
    response.status(400).json({ error: message })
    return
  }
  if (error instanceof UploadValidationError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }
  if (error instanceof PdfExtractionError) {
    response.status(422).json({ error: error.message })
    return
  }
  if (
    error instanceof Error &&
    (error.name === 'MongoServerSelectionError' ||
      error.message.includes('buffering timed out') ||
      error.message.includes('ECONNREFUSED'))
  ) {
    response.status(503).json({ error: 'Database is unavailable. Start MongoDB or check MONGODB_URI.' })
    return
  }
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
}
