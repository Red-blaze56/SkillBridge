import { roleConfigurations } from '../config/roleConfig.js'
import type { RoleSkill } from '../types/assessment.js'
import type { ResumeAnalysisResult } from '../types/resumeAnalysis.js'

const practicalMarkers = ['built', 'developed', 'implemented', 'created', 'deployed', 'worked', 'used', 'integrated', 'designed', 'contributed', 'project', 'experience']

/** Lower-case and turn every separator ("node.js", "html/css", commas) into a single space. Keeps + and # for C++ / C#. */
export function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()
}

/**
 * True when `phrase` appears in `text` as whole words.
 * "react" matches "React.js developer" but "java" does not match "javascript",
 * and "git" does not match "digital".
 */
export function mentions(text: string, phrase: string): boolean {
  const needle = normalized(phrase)
  if (!needle) return false
  return ` ${normalized(text)} `.includes(` ${needle} `)
}

export function mentionsSkill(text: string, skill: RoleSkill): boolean {
  return skill.aliases.some((alias) => mentions(text, alias))
}

/**
 * How strongly the resume demonstrates a skill:
 * 0 = not mentioned, 1 = listed only, 2 = one practical source, 3 = two or more practical sources.
 */
export function evidenceLevel(analysis: ResumeAnalysisResult, skill: RoleSkill): number {
  const matchingSkills = analysis.skills.filter((item) => mentionsSkill(item.name, skill))
  const matchingProjects = analysis.projects.filter((project) =>
    project.technologies.some((technology) => mentionsSkill(technology, skill)) || mentionsSkill(`${project.name} ${project.description}`, skill),
  )
  const matchingExperience = analysis.experience.filter((experience) =>
    mentionsSkill(`${experience.title} ${experience.company} ${experience.description}`, skill),
  )
  const practicalSkillEvidence = matchingSkills.filter((item) => practicalMarkers.some((marker) => mentions(item.evidence, marker)))
  const practicalSources = matchingProjects.length + matchingExperience.length + practicalSkillEvidence.length

  if (practicalSources >= 2) return 3
  if (practicalSources === 1) return 2
  if (matchingSkills.length > 0) return 1
  return 0
}

/** Every skill known across all target roles, de-duplicated by name. */
export const skillCatalog: RoleSkill[] = [
  ...new Map(
    Object.values(roleConfigurations)
      .flatMap((role) => role.skills)
      .map((skill) => [skill.name, skill] as const),
  ).values(),
]

export function findCatalogSkill(name: string): RoleSkill | undefined {
  return skillCatalog.find((skill) => skill.name === name) ?? skillCatalog.find((skill) => mentionsSkill(name, skill))
}
