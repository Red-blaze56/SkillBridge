import { Router } from 'express'
import { createAssessmentController, getAssessmentController, getAssessmentHistoryController } from '../controllers/assessmentController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const assessmentRouter = Router()

assessmentRouter.use(requireAuth)
assessmentRouter.post('/', createAssessmentController)
assessmentRouter.get('/history', getAssessmentHistoryController)
assessmentRouter.get('/:id', getAssessmentController)

export default assessmentRouter
