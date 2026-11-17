import { Schema, model } from 'mongoose'

export interface UserDocument {
  fullName: string
  email: string
  password: string
  targetRole?: string
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDocument>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    targetRole: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true },
)

export const User = model<UserDocument>('User', userSchema)
