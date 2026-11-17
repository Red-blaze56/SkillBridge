import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env.js'
import { User, type UserDocument } from '../models/User.js'
import type { SafeUser } from '../types/auth.js'

function requireJwtSecret(): string {
  if (!env.jwtSecret) throw new Error('JWT_SECRET is not configured')
  return env.jwtSecret
}

export function toSafeUser(user: UserDocument & { _id: { toString(): string } }): SafeUser {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    ...(user.targetRole ? { targetRole: user.targetRole } : {}),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function createToken(user: UserDocument & { _id: { toString(): string } }): string {
  return jwt.sign({ userId: user._id.toString(), email: user.email }, requireJwtSecret(), {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  })
}

export async function signup(input: { fullName: string; email: string; password: string; targetRole?: string }) {
  const existingUser = await User.exists({ email: input.email })
  if (existingUser) throw new Error('An account with this email already exists')

  const password = await bcrypt.hash(input.password, 12)
  const user = await User.create({ ...input, password })
  return { token: createToken(user), user: toSafeUser(user) }
}

export async function login(input: { email: string; password: string }) {
  const user = await User.findOne({ email: input.email }).select('+password')
  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    throw new Error('Invalid email or password')
  }
  return { token: createToken(user), user: toSafeUser(user) }
}

export async function getProfile(userId: string): Promise<SafeUser | null> {
  const user = await User.findById(userId)
  return user ? toSafeUser(user) : null
}
