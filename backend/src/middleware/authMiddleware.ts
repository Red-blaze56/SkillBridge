import type { NextFunction, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { AuthenticatedRequest } from '../types/auth.js'

interface TokenPayload {
  userId: string
  email: string
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  if (env.disableAuth) {
    request.user = { id: '000000000000000000000001', email: 'dev@skillbridge.local' }
    next()
    return
  }
  const header = request.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || !env.jwtSecret) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    if (typeof payload !== 'object' || !('userId' in payload) || typeof payload.userId !== 'string' || !('email' in payload) || typeof payload.email !== 'string') {
      response.status(401).json({ error: 'Invalid authentication token' })
      return
    }
    const tokenPayload = payload as TokenPayload
    request.user = { id: tokenPayload.userId, email: tokenPayload.email }
    next()
  } catch {
    response.status(401).json({ error: 'Invalid or expired authentication token' })
  }
}
