import type { Request, Response, NextFunction } from 'express'
import { getDatabaseStatus } from '../config/database.js'

export function requireDatabase(_request: Request, response: Response, next: NextFunction): void {
  if (getDatabaseStatus() !== 'connected') {
    response.status(503).json({ error: 'Database is unavailable. Start MongoDB or check MONGODB_URI.' })
    return
  }
  next()
}
