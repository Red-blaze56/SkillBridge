import { Router } from 'express'
import { runAgentsController } from '../controllers/agentController.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const agentRouter = Router()

agentRouter.use(requireAuth)
agentRouter.post('/:id/agents', runAgentsController)

export default agentRouter
