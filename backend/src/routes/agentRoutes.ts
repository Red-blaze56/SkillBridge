import { Router } from 'express'
import { getLatestAgentsController, runAgentsController } from '../controllers/agentController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const agentRouter = Router()

agentRouter.use(requireAuth)
agentRouter.post('/:id/agents', runAgentsController)
agentRouter.get('/:id/agents', getLatestAgentsController)

export default agentRouter
