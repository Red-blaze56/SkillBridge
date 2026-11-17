import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.mongoUri)
  console.log('MongoDB connected')
}

export function getDatabaseStatus(): 'connected' | 'connecting' | 'disconnected' | 'disconnecting' {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected'
    case 2:
      return 'connecting'
    case 3:
      return 'disconnecting'
    default:
      return 'disconnected'
  }
}
