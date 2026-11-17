import { Router } from 'express'
import { getApiInfo } from '../controllers/api.controller.js'
import { getHealth } from '../controllers/health.controller.js'

const apiRouter = Router()

apiRouter.get('/', getApiInfo)
apiRouter.get('/health', getHealth)

export default apiRouter
