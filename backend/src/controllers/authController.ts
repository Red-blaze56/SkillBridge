import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import { getProfile, login, signup } from '../services/authService.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { loginSchema, signupSchema } from '../validators/authValidator.js'

function validationMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ')
}

export async function signupController(request: Request, response: Response): Promise<void> {
  try {
    const input = signupSchema.parse(request.body)
    const result = await signup(input)
    response.status(201).json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: validationMessage(error) })
      return
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      response.status(409).json({ error: error.message })
      return
    }
    throw error
  }
}

export async function loginController(request: Request, response: Response): Promise<void> {
  try {
    const input = loginSchema.parse(request.body)
    response.status(200).json(await login(input))
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: validationMessage(error) })
      return
    }
    if (error instanceof Error && error.message === 'Invalid email or password') {
      response.status(401).json({ error: error.message })
      return
    }
    throw error
  }
}

export async function meController(request: AuthenticatedRequest, response: Response): Promise<void> {
  if (!request.user) {
    response.status(401).json({ error: 'Authentication required' })
    return
  }
  const user = await getProfile(request.user.id)
  if (!user) {
    response.status(404).json({ error: 'User not found' })
    return
  }
  response.status(200).json({ user })
}
