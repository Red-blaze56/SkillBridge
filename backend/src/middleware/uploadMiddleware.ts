import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import multer from 'multer'

export class UploadValidationError extends Error {
  statusCode = 400
}

export const resumeUploadDirectory = path.resolve(process.cwd(), 'uploads', 'resumes')
fs.mkdirSync(resumeUploadDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, resumeUploadDirectory),
  filename: (_request, _file, callback) => callback(null, `${randomUUID()}.pdf`),
})

const fileFilter: multer.Options['fileFilter'] = (_request, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase()
  if (extension !== '.pdf' || file.mimetype !== 'application/pdf') {
    callback(new UploadValidationError('Only PDF files are supported'))
    return
  }
  callback(null, true)
}

export const uploadResume = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter,
})
