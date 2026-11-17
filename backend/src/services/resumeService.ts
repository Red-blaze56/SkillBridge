import fs from 'node:fs/promises'
import path from 'node:path'
import mongoose from 'mongoose'
import { Resume } from '../models/Resume.js'
import { resumeUploadDirectory } from '../middleware/uploadMiddleware.js'
import { extractPdfText } from './pdfExtractionService.js'

function storedFilePath(fileName: string): string {
  const resolvedPath = path.resolve(resumeUploadDirectory, fileName)
  const directoryPrefix = `${path.resolve(resumeUploadDirectory)}${path.sep}`
  if (!resolvedPath.startsWith(directoryPrefix)) throw new Error('Invalid stored file name')
  return resolvedPath
}

export async function createResume(userId: string, file: Express.Multer.File) {
  try {
    const extracted = await extractPdfText(file.path)
    const resume = await Resume.create({
      userId,
      originalFileName: file.originalname,
      fileName: file.filename,
      fileSize: file.size,
      mimeType: file.mimetype,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      uploadStatus: 'processed',
    })
    return { resume, pageCount: extracted.pageCount }
  } catch (error) {
    await removeFile(file.filename)
    throw error
  }
}

export async function listResumes(userId: string) {
  return Resume.find({ userId }).select('-extractedText -analysisResult -analysisError -__v').sort({ createdAt: -1 }).lean()
}

export async function getResume(userId: string, resumeId: string) {
  if (!mongoose.isValidObjectId(resumeId)) return null
  return Resume.findOne({ _id: resumeId, userId }).select('-__v').lean()
}

export async function deleteResume(userId: string, resumeId: string) {
  if (!mongoose.isValidObjectId(resumeId)) return null
  const resume = await Resume.findOneAndDelete({ _id: resumeId, userId })
  if (!resume) return null
  await removeFile(resume.fileName)
  return resume
}

async function removeFile(fileName: string): Promise<void> {
  try {
    await fs.unlink(storedFilePath(fileName))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
