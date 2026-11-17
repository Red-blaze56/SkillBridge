import type { Request, Response } from 'express'

export function getApiInfo(_request: Request, response: Response): void {
  response.status(200).json({
    name: 'SkillBridge',
    description: 'Multi-Agent AI Career Readiness Platform API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
    },
  })
}
