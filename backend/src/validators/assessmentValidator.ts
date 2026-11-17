import { z } from 'zod'
import { targetRoles } from '../config/roleConfig.js'

export const assessmentRequestSchema = z.object({
  resumeId: z.string().regex(/^[a-f\d]{24}$/i, 'resumeId must be a valid MongoDB ObjectId'),
  targetRole: z.enum(targetRoles),
})
