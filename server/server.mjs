import { createServer } from 'node:http'
import { inflateRawSync, inflateSync } from 'node:zlib'

const port = Number(process.env.PORT ?? 8787)
const maxFileSize = 10 * 1024 * 1024

const skillDefinitions = [
  { name: 'JavaScript', keywords: ['javascript', 'typescript', 'ecmascript', 'node.js', 'nodejs'], color: 'blue' },
  { name: 'React', keywords: ['react', 'next.js', 'nextjs'], color: 'violet' },
  { name: 'Node.js', keywords: ['node.js', 'nodejs', 'express', 'nestjs'], color: 'teal' },
  { name: 'SQL', keywords: ['sql', 'postgresql', 'mysql', 'mongodb', 'database'], color: 'orange' },
  { name: 'DSA', keywords: ['data structures', 'algorithms', 'leetcode', 'complexity', 'dsa'], color: 'pink' },
  { name: 'System Design', keywords: ['system design', 'microservices', 'scalability', 'distributed systems', 'architecture'], color: 'indigo' },
]

const roleKeywords = {
  'Full Stack Developer': ['javascript', 'react', 'node.js', 'sql', 'system design'],
  'Backend Developer': ['node.js', 'sql', 'system design', 'algorithms'],
  'Frontend Developer': ['javascript', 'react', 'typescript', 'css'],
  'AI Engineer': ['python', 'machine learning', 'deep learning', 'sql', 'algorithms'],
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(body))
}

function extractTextFromPdf(buffer) {
  const source = buffer.toString('latin1')
  const streams = []
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = Buffer.from(match[1], 'latin1')
    const start = match.index ?? 0
    const dictionary = source.slice(Math.max(0, start - 500), start)
    if (dictionary.includes('/FlateDecode')) {
      try {
        streams.push(inflateSync(raw).toString('latin1'))
      } catch {
        try {
          streams.push(inflateRawSync(raw).toString('latin1'))
        } catch {
          continue
        }
      }
    } else {
      streams.push(raw.toString('latin1'))
    }
  }
  const content = streams.length ? streams.join('\n') : source
  const textObjects = []
  const decodeLiteral = (value) => value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([nrtbf])/g, (_, character) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[character])
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
  for (const match of content.matchAll(/\[((?:.|\r?\n)*?)\]\s*TJ|(\((?:\\.|[^()\\])*\)|<[\da-fA-F\s]+>)\s*Tj/gi)) {
    const expression = match[1] ?? match[2] ?? ''
    const literals = [...expression.matchAll(/\((\\.|[^()\\])*\)/g)].map((item) => decodeLiteral(item[0].slice(1, -1)))
    const hex = [...expression.matchAll(/<([\da-fA-F\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s/g, ''), 'hex').toString('latin1'))
    textObjects.push([...literals, ...hex].join(''))
  }
  return textObjects.join(' ').replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/)
  if (!boundaryMatch) throw new Error('Missing multipart boundary')
  const boundary = Buffer.from(`--${boundaryMatch[1]}`)
  const fields = {}
  let file
  let cursor = 0

  while (cursor < body.length) {
    const start = body.indexOf(boundary, cursor)
    if (start === -1) break
    const headerStart = start + boundary.length + 2
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd === -1) break
    const headers = body.subarray(headerStart, headerEnd).toString('utf8')
    const dataStart = headerEnd + 4
    const dataEnd = body.indexOf(Buffer.from('\r\n--'), dataStart)
    if (dataEnd === -1) break
    const disposition = headers.match(/Content-Disposition: form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i)
    if (disposition) {
      if (disposition[2] !== undefined) file = { name: disposition[2], data: body.subarray(dataStart, dataEnd) }
      else fields[disposition[1]] = body.subarray(dataStart, dataEnd).toString('utf8')
    }
    cursor = dataEnd + 2
  }
  return { fields, file }
}

function analyzeResume(text, role) {
  const normalized = text.toLowerCase()
  const skills = skillDefinitions.map((skill) => {
    const matches = skill.keywords.filter((keyword) => normalized.includes(keyword))
    const score = Math.min(95, 35 + matches.length * 20 + (matches.length ? Math.min(20, Math.floor(text.length / 500)) : 0))
    return { name: skill.name, score, color: skill.color, evidence: matches.length ? `Mentioned ${matches.length} time${matches.length === 1 ? '' : 's'} in your resume` : 'Not found in extracted resume text' }
  })
  const required = roleKeywords[role] ?? roleKeywords['Full Stack Developer']
  const gaps = skills.filter((skill) => required.some((keyword) => skill.name.toLowerCase().includes(keyword) || keyword.includes(skill.name.toLowerCase())) && skill.score < 70)
    .sort((a, b) => a.score - b.score)
    .map((skill) => ({ skill: skill.name, priority: skill.score < 50 ? 'High' : 'Medium', reason: `Add a project or measurable outcome demonstrating ${skill.name}.` }))
  const score = Math.round(skills.reduce((total, skill) => total + skill.score, 0) / skills.length)
  return {
    score,
    role,
    skills,
    gaps,
    suggestions: gaps.slice(0, 3).map((gap) => `Build one portfolio project that demonstrates ${gap.skill}.`),
    extractedCharacters: text.length,
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
    response.end()
    return
  }
  if (request.method !== 'POST' || request.url !== '/api/analyze-resume') {
    sendJson(response, 404, { error: 'Endpoint not found' })
    return
  }

  try {
    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.startsWith('multipart/form-data')) throw new Error('Expected a multipart form upload')
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > maxFileSize + 1024 * 1024) throw new Error('Request is too large')
      chunks.push(chunk)
    }
    const { fields, file } = parseMultipart(Buffer.concat(chunks), contentType)
    if (!file?.data.length) throw new Error('A resume PDF is required')
    if (file.data.length > maxFileSize) throw new Error('Resume must be 10 MB or smaller')
    if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF resumes are supported')
    const text = extractTextFromPdf(file.data)
    if (!text) throw new Error('Could not extract readable text from this PDF. Scanned or image-only PDFs require OCR.')
    sendJson(response, 200, { analysis: analyzeResume(text, fields.role || 'Full Stack Developer') })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Resume analysis failed' })
  }
})

server.listen(port, () => console.log(`SkillBridge API listening on http://localhost:${port}`))
