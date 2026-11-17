import { env } from '../config/env.js'

/** A job posting as returned by the Adzuna search API, flattened to what SkillBridge needs. */
export interface JobPosting {
  id: string
  title: string
  company: string
  location: string
  description: string
  url?: string
  postedAt?: string
  salary?: string
  contractType?: string
}

export class JobSearchError extends Error {}

interface AdzunaJob {
  id?: string | number
  title?: string
  description?: string
  redirect_url?: string
  created?: string
  company?: { display_name?: string }
  location?: { display_name?: string }
  salary_min?: number
  salary_max?: number
  contract_time?: string
  contract_type?: string
}

const currencies: Record<string, string> = { in: 'INR', gb: 'GBP', us: 'USD', ca: 'CAD', au: 'AUD', sg: 'SGD', de: 'EUR', fr: 'EUR', nl: 'EUR' }

export function isAdzunaConfigured(): boolean {
  return Boolean(env.adzunaAppId && env.adzunaAppKey)
}

/** Adzuna wraps search terms in <strong> tags; strip all markup and tidy whitespace. */
function plainText(value = ''): string {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function formatSalary(min?: number, max?: number): string | undefined {
  if (!min && !max) return undefined
  const currency = currencies[env.adzunaCountry]
  const format = (value: number) =>
    currency
      ? new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
      : Math.round(value).toLocaleString('en')
  if (min && max && Math.round(min) !== Math.round(max)) return `${format(min)} – ${format(max)}`
  return format((min || max) as number)
}

function contractLabel(job: AdzunaJob): string | undefined {
  const parts = [job.contract_time, job.contract_type].filter(Boolean).map((part) => (part as string).replace(/_/g, '-'))
  return parts.length ? parts.join(', ') : undefined
}

export async function searchAdzunaJobs(query: string, location = env.adzunaLocation, resultsPerPage = 20): Promise<JobPosting[]> {
  if (!isAdzunaConfigured()) throw new JobSearchError('Adzuna job search is not configured')

  const params = new URLSearchParams({
    app_id: env.adzunaAppId,
    app_key: env.adzunaAppKey,
    what: query,
    results_per_page: String(resultsPerPage),
    'content-type': 'application/json',
  })
  if (location) params.set('where', location)

  const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(env.adzunaCountry)}/search/1?${params}`
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new JobSearchError('Job search service could not be reached')
  }
  if (response.status === 401 || response.status === 403) throw new JobSearchError('Job search credentials were rejected (check ADZUNA_APP_ID / ADZUNA_APP_KEY)')
  if (!response.ok) throw new JobSearchError(`Job search failed (HTTP ${response.status})`)

  const body = (await response.json()) as { results?: AdzunaJob[] }
  return (body.results ?? []).map((job, index) => ({
    id: String(job.id ?? index),
    title: plainText(job.title) || 'Untitled role',
    company: plainText(job.company?.display_name) || 'Company not listed',
    location: plainText(job.location?.display_name) || 'Not specified',
    description: plainText(job.description),
    url: job.redirect_url,
    postedAt: job.created,
    salary: formatSalary(job.salary_min, job.salary_max),
    contractType: contractLabel(job),
  }))
}
