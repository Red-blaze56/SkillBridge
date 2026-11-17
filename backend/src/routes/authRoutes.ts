import { Router } from 'express'
import { loginController, meController, signupController } from '../controllers/authController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { requireDatabase } from '../middleware/database.middleware.js'

const authRouter = Router()

authRouter.use(requireDatabase)
authRouter.post('/signup', signupController)
authRouter.post('/login', loginController)
authRouter.get('/me', requireAuth, meController)

export default authRouter
