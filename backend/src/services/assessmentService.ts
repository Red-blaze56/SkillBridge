import mongoose from 'mongoose'
import { roleConfigurations } from '../config/roleConfig.js'
import { Assessment } from '../models/Assessment.js'
import { Resume } from '../models/Resume.js'
import type { ResumeAnalysisResult } from '../types/resumeAnalysis.js'
import type { AssessmentDocument, ReadinessLevel, RoleSkill, SkillBreakdown, SkillStatus, TargetRole } from '../types/assessment.js'
import { evidenceLevel } from '../utils/skillMatching.js'

export class AssessmentError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

function skillStatus(evidence: number, expected: number): SkillStatus {
  const ratio = evidence / expected
  if (ratio >= 0.85) return 'Strong'
  if (ratio >= 0.55) return 'Developing'
  if (ratio > 0) return 'Weak'
  return 'Missing'
}

function readinessLevel(score: number): ReadinessLevel {
  if (score < 40) return 'Needs Improvement'
  if (score < 60) return 'Developing'
  if (score < 80) return 'Moderate'
  return 'Job Ready'
}

function calculateBreakdown(analysis: ResumeAnalysisResult, skills: RoleSkill[]): SkillBreakdown[] {
  return skills.map((skill) => {
    const evidence = evidenceLevel(analysis, skill)
    const score = Math.min(skill.weight, Number(((evidence / skill.expectedLevel) * skill.weight).toFixed(2)))
    return {
      skill: skill.name,
      category: skill.category,
      evidenceLevel: evidence,
      expectedLevel: skill.expectedLevel,
      weight: skill.weight,
      score,
      status: skillStatus(evidence, skill.expectedLevel),
    }
  })
}

function recommendations(breakdown: SkillBreakdown[]): string[] {
  return [...breakdown]
    .filter((item) => item.status !== 'Strong')
    .sort((a, b) => (b.weight - b.score) - (a.weight - a.score) || b.weight - a.weight)
    .slice(0, 5)
    .map((item) => {
      if (item.evidenceLevel === 0) return `Add a practical project or learning milestone demonstrating ${item.skill}.`
      if (item.evidenceLevel === 1) return `Strengthen ${item.skill} evidence with a project and measurable implementation details.`
      return `Deepen ${item.skill} by documenting a more complex implementation and its measurable outcome.`
    })
}

function buildResult(analysis: ResumeAnalysisResult, targetRole: TargetRole) {
  const breakdown = calculateBreakdown(analysis, roleConfigurations[targetRole].skills)
  const readinessScore = Math.min(100, Math.max(0, Math.round(breakdown.reduce((total, item) => total + item.score, 0))))
  const strengths = breakdown.filter((item) => item.status === 'Strong').map((item) => item.skill)
  const skillGaps = breakdown
    .filter((item) => item.status !== 'Strong')
    .sort((a, b) => (b.weight - b.score) - (a.weight - a.score))
    .map((item) => `${item.skill} (${item.status.toLowerCase()}, ${Number((item.weight - item.score).toFixed(2))} points of impact)`)

  return {
    readinessScore,
    readinessLevel: readinessLevel(readinessScore),
    skillBreakdown: breakdown,
    strengths,
    skillGaps,
    recommendations: recommendations(breakdown),
  }
}

export async function createAssessment(userId: string, resumeId: string, targetRole: TargetRole): Promise<AssessmentDocument> {
  if (!mongoose.isValidObjectId(resumeId)) throw new AssessmentError('Invalid resume id', 400)
  const resume = await Resume.findOne({ _id: resumeId, userId }).lean()
  if (!resume) throw new AssessmentError('Resume not found', 404)
  if (resume.analysisStatus !== 'completed' || !resume.analysisResult) {
    throw new AssessmentError('Resume must have a completed AI analysis before assessment', 409)
  }
  const result = buildResult(resume.analysisResult, targetRole)
  return Assessment.create({ userId, resumeId, targetRole, ...result })
}

export async function getAssessment(userId: string, assessmentId: string) {
  if (!mongoose.isValidObjectId(assessmentId)) throw new AssessmentError('Invalid assessment id', 400)
  const assessment = await Assessment.findOne({ _id: assessmentId, userId }).lean()
  if (!assessment) throw new AssessmentError('Assessment not found', 404)
  return assessment
}

export async function getAssessmentHistory(userId: string) {
  return Assessment.find({ userId }).sort({ createdAt: -1 }).lean()
}
