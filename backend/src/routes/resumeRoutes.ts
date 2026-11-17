import { Router } from 'express'
import { deleteResumeController, getResumeController, listResumesController, uploadResumeController } from '../controllers/resumeController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { uploadResume } from '../middleware/uploadMiddleware.js'
import { analyzeResumeController, getResumeAnalysisController, reanalyzeResumeController } from '../controllers/resumeAnalysisController.js'

const resumeRouter = Router()

resumeRouter.use(requireAuth)
resumeRouter.post('/upload', uploadResume.single('resume'), uploadResumeController)
resumeRouter.post('/:id/analyze', analyzeResumeController)
resumeRouter.post('/:id/reanalyze', reanalyzeResumeController)
resumeRouter.get('/:id/analysis', getResumeAnalysisController)
resumeRouter.get('/', listResumesController)
resumeRouter.get('/:id', getResumeController)
resumeRouter.delete('/:id', deleteResumeController)

export default resumeRouter
