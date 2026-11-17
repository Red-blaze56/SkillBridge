import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/error.middleware.js'
import { requireDatabase } from './middleware/database.middleware.js'
import authRouter from './routes/authRoutes.js'
import apiRouter from './routes/api.routes.js'
import resumeRouter from './routes/resumeRoutes.js'
import assessmentRouter from './routes/assessmentRoutes.js'
import agentRouter from './routes/agentRoutes.js'

const app = express()

app.use(helmet())
app.use(cors({ origin: env.frontendUrl }))
app.use(express.json())
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'))

app.use('/api', apiRouter)
app.use(['/api/auth', '/api/resumes', '/api/assessment'], requireDatabase)
app.use('/api/auth', authRouter)
app.use('/api/resumes', resumeRouter)
app.use('/api/assessment', assessmentRouter)
app.use('/api/assessment', agentRouter)
app.use(notFound)
app.use(errorHandler)

export default app
