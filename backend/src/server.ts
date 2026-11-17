import app from './app.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'

async function startServer(): Promise<void> {
  try {
    await connectDatabase()
  } catch (error) {
    console.error('MongoDB connection failed. The server will continue without a database connection.', error)
  }

  app.listen(env.port, () => {
    console.log(`SkillBridge API running at http://localhost:${env.port}`)
  })
}

void startServer()
