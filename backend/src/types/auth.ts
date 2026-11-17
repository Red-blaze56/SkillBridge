import type { Request } from 'express'

export interface AuthenticatedUser {
  id: string
  email: string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}

export interface SafeUser {
  id: string
  fullName: string
  email: string
  targetRole?: string
  createdAt: Date
  updatedAt: Date
}
