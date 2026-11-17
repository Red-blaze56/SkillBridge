import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Radar,
  Sparkles,
  Target,
  Upload,
  Zap,
} from 'lucide-react'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { getMe, login, logout, signup, type User } from './services/authService'
import { createAssessment, getAssessment, getAssessmentHistory, type Assessment } from './services/assessmentService'
import { getLatestAgents, runAgents, type AgentName, type AgentResults, type SkillGap } from './services/agentService'
import { analyzeResume, getResume, listResumes, uploadResume, type Resume } from './services/resumeService'
import { ApiError } from './services/api'
import './App.css'

type Role = 'Full Stack Developer' | 'Backend Developer' | 'Frontend Developer' | 'AI Engineer'

const roles: Role[] = ['Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'AI Engineer']
const authBypassed = import.meta.env.VITE_DISABLE_AUTH === 'true'
const devUser: User = {
  id: '000000000000000000000001',
  fullName: 'Development User',
  email: 'dev@skillbridge.local',
  targetRole: roles[0],
  createdAt: '',
  updatedAt: '',
}

/* ------------------------------------------------------------------ */
/* App root and authentication                                         */
/* ------------------------------------------------------------------ */

function App() {
  const [user, setUser] = useState<User | null>(authBypassed ? devUser : null)
  const [authLoading, setAuthLoading] = useState(!authBypassed && Boolean(localStorage.getItem('skillbridge_token')))

  useEffect(() => {
    if (authBypassed) return
    const handleLogout = () => setUser(null)
    window.addEventListener('skillbridge:logout', handleLogout)
    if (localStorage.getItem('skillbridge_token')) {
      getMe()
        .then(setUser)
        .catch(() => logout())
        .finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
    return () => window.removeEventListener('skillbridge:logout', handleLogout)
  }, [])

  if (authLoading) return <LoadingPage label="Restoring your session..." />

  return (
    <BrowserRouter>
      {user ? (
        <AuthenticatedApp user={user} onLogout={logout} />
      ) : (
        <Routes>
          <Route path="*" element={<AuthPage onAuthenticated={setUser} />} />
        </Routes>
      )}
    </BrowserRouter>
  )
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [signupMode, setSignupMode] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', password: '', targetRole: roles[0] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const user = signupMode ? await signup(form) : await login(form.email, form.password)
      onAuthenticated(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <Zap size={18} fill="currentColor" />
          </div>
          <span>Skill<span>Bridge</span></span>
        </div>

        <p className="eyebrow">{signupMode ? 'Create workspace' : 'Welcome back'}</p>
        <h1>{signupMode ? 'Start your career journey' : 'Sign in to SkillBridge'}</h1>
        <p className="heading-detail">Connect your resume to a clear, evidence-based readiness plan.</p>

        {signupMode && (
          <input
            className="auth-input"
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        )}
        <input
          className="auth-input"
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="auth-input"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {signupMode && (
          <select
            className="auth-input"
            value={form.targetRole}
            onChange={(e) => setForm({ ...form, targetRole: e.target.value as Role })}
          >
            {roles.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
        )}

        {error && <p className="error-text">{error}</p>}

        <Button onClick={submit} disabled={loading}>
          {loading && <LoaderCircle size={16} className="spin" />}
          {signupMode ? 'Create account' : 'Sign in'}
        </Button>
        <button
          className="text-link auth-switch"
          onClick={() => {
            setSignupMode(!signupMode)
            setError('')
          }}
        >
          {signupMode ? 'Already have an account? Sign in' : 'New to SkillBridge? Create an account'}
        </button>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function AuthenticatedApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [mobile, setMobile] = useState(false)

  return (
    <div className="app-shell">
      <Sidebar mobile={mobile} close={() => setMobile(false)} user={user} onLogout={onLogout} />
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobile(true)} aria-label="Open navigation">
            <Menu size={21} />
          </button>
          <div className="crumb">
            <span>Workspace</span>
            <span className="crumb-divider">/</span>
            <strong>Career readiness</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill"><span className="live-dot" /> Connected API</span>
            <div className="avatar">{initials(user.fullName)}</div>
          </div>
        </header>

        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/resume" element={<ResumePage user={user} />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/skill-gaps" element={<SkillGapsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function Sidebar({ mobile, close, user, onLogout }: { mobile: boolean; close: () => void; user: User; onLogout: () => void }) {
  const links = [
    ['/', 'Overview', LayoutDashboard],
    ['/resume', 'Resume & role', FileText],
    ['/results', 'Assessment results', BarChart3],
    ['/agents', 'AI agents', Sparkles],
    ['/skill-gaps', 'Skill gaps', Radar],
    ['/jobs', 'Job finder', BriefcaseBusiness],
    ['/roadmap', 'Learning roadmap', Target],
  ] as const

  return (
    <>
      {mobile && <button className="nav-scrim" onClick={close} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Zap size={18} fill="currentColor" />
          </div>
          <span>Skill<span>Bridge</span></span>
          <span className="brand-beta">LIVE</span>
        </div>

        <div className="profile-card">
          <div className="avatar large">{initials(user.fullName)}</div>
          <div>
            <strong>{user.fullName}</strong>
            <span>{user.targetRole || 'Career explorer'}</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <p className="nav-label">Your workspace</p>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={close}>
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="logout-button" onClick={onLogout}>Sign out</button>
          <p className="sidebar-foot">SkillBridge · connected prototype</p>
        </div>
      </aside>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

function Dashboard({ user }: { user: User }) {
  const [history, setHistory] = useState<Assessment[]>([])
  const [resume, setResume] = useState<Resume | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getAssessmentHistory(), listResumes()])
      .then(([assessments, resumes]) => {
        setHistory(assessments)
        setResume(resumes[0] || null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load dashboard'))
  }, [])

  const latest = history[0]
  const skills = resume?.analysisResult?.skills || []

  return (
    <div className="page">
      <Heading
        eyebrow="Career workspace"
        title={`Good morning, ${user.fullName.split(' ')[0]}`}
        detail="Your actual resume evidence and assessment history in one place."
        action={<Button onClick={() => window.location.assign('/resume')}><Upload size={16} /> Start assessment</Button>}
      />

      {error && <ErrorBanner message={error} />}

      {!latest && !resume && (
        <EmptyState
          title="Your workspace is ready"
          detail="Upload a PDF resume to begin your analysis and readiness assessment."
          action={<Button onClick={() => window.location.assign('/resume')}>Upload resume <ArrowRight size={15} /></Button>}
        />
      )}

      {(latest || resume) && (
        <>
          <section className="stats-grid">
            <div className="stat-card score-card">
              <div className="stat-top">
                <span>Career readiness score</span>
                <span className="trend">{latest ? latest.readinessLevel : 'Not assessed'}</span>
              </div>
              <div className="score-row">
                <strong>{latest ? latest.readinessScore : '—'}</strong>
                <span>{latest ? '/100' : ''}</span>
              </div>
              <div className="stat-foot">
                <span>{latest ? latest.targetRole : 'Assessment pending'}</span>
                <span>{latest ? new Date(latest.createdAt).toLocaleDateString() : 'Upload a resume'}</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Skills extracted</span>
                <span className="stat-icon blue"><BarChart3 size={17} /></span>
              </div>
              <strong className="stat-number">{skills.length}</strong>
              <p className="stat-sub">From your latest resume analysis</p>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Target role</span>
                <span className="stat-icon violet"><Target size={17} /></span>
              </div>
              <strong className="role-stat">{latest?.targetRole || user.targetRole || 'Not selected'}</strong>
              <p className="stat-sub">Your current focus area</p>
            </div>
          </section>

          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Resume evidence</p>
                  <h2>Extracted skills</h2>
                </div>
              </div>
              {skills.length ? (
                <div className="live-skill-list">
                  {skills.slice(0, 8).map((skill) => (
                    <div className="live-skill" key={skill.name}>
                      <strong>{skill.name}</strong>
                      <span>{skill.proficiency}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Analysis not ready" detail="Upload and analyze your resume to see extracted skills." />
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Assessment history</p>
                  <h2>Recent assessments</h2>
                </div>
              </div>
              {history.length ? (
                history.slice(0, 4).map((item) => (
                  <div className="history-row" key={item._id}>
                    <div>
                      <strong>{item.targetRole}</strong>
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    <b>{item.readinessScore}<small>/100</small></b>
                  </div>
                ))
              ) : (
                <EmptyState title="No assessments yet" detail="Your completed assessments will appear here." />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function ResumePage({ user }: { user: User }) {
  const [file, setFile] = useState<File | null>(null)
  const [resumeId, setResumeId] = useState(localStorage.getItem('skillbridge_resume_id') || '')
  const [resume, setResume] = useState<Resume | null>(null)
  const [role, setRole] = useState<Role>((user.targetRole as Role) || roles[0])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (resumeId) getResume(resumeId).then(setResume).catch(() => setResume(null))
  }, [resumeId])

  const process = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setMessage('Uploading resume...')
    try {
      const uploaded = await uploadResume(file)
      setResumeId(uploaded.resumeId)
      localStorage.setItem('skillbridge_resume_id', uploaded.resumeId)
      setMessage('Resume uploaded. Extracting text and analyzing with Gemini...')
      const analyzed = await analyzeResume(uploaded.resumeId)
      setResume(analyzed)
      setMessage('Resume analysis completed. You can now create your readiness assessment.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resume processing failed')
      setMessage('')
    } finally {
      setLoading(false)
    }
  }

  const assess = async () => {
    if (!resumeId) return
    setLoading(true)
    setError('')
    try {
      const assessment = await createAssessment(resumeId, role)
      localStorage.setItem('skillbridge_assessment_id', assessment._id)
      navigate('/results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed')
    } finally {
      setLoading(false)
    }
  }

  const analysis = resume?.analysisResult

  return (
    <div className="page">
      <Heading
        eyebrow="Assessment setup"
        title="Resume & target role"
        detail="Upload your resume, analyze its evidence, and calculate readiness for a target role."
        action={<span className="demo-tag"><Sparkles size={12} /> Live backend</span>}
      />

      <div className="form-layout">
        <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <h2>Upload your resume</h2>
              <p className="panel-detail">PDF only · maximum 5 MB · stored securely on the backend.</p>
            </div>
            <FileText size={20} className="heading-icon" />
          </div>

          <label className={`upload-zone ${file || resume ? 'has-file' : ''}`}>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
            />
            <Upload size={25} />
            <strong>{file?.name || resume?.originalFileName || 'Choose a PDF resume'}</strong>
            <span>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(2)} MB selected`
                : resume
                  ? `Analysis status: ${resume.analysisStatus}`
                  : 'PDF only · max 5 MB'}
            </span>
            <span className="upload-action">Browse files</span>
          </label>

          {message && <p className="success-text"><Check size={14} /> {message}</p>}
          {error && <ErrorBanner message={error} />}

          <div className="form-actions">
            <Button onClick={process} disabled={!file || loading}>
              {loading && <LoaderCircle size={16} className="spin" />} {loading ? 'Processing...' : 'Upload & analyze resume'}
            </Button>
          </div>

          {analysis && (
            <div className="analysis-preview">
              <h3>Analysis ready</h3>
              <p>{analysis.skills.length} skills · {analysis.education.length} education entries · {analysis.projects.length} projects · {analysis.experience.length} experiences</p>
              <div className="live-skill-list">
                {analysis.skills.slice(0, 6).map((skill) => (
                  <div className="live-skill" key={skill.name}>
                    <strong>{skill.name}</strong>
                    <span>{skill.proficiency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-section">
            <label className="field-label">Target role</label>
            <div className="role-options">
              {roles.map((option) => (
                <button key={option} className={`role-option ${role === option ? 'selected' : ''}`} onClick={() => setRole(option)}>
                  {option}
                  {role === option && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <Button onClick={assess} disabled={!resumeId || !analysis || loading}>
              <Target size={16} /> Calculate readiness
            </Button>
            {!analysis && <span className="validation"><CircleHelp size={14} /> Complete resume analysis first</span>}
          </div>
        </section>

        <aside className="panel side-note">
          <div className="note-orb"><Sparkles size={20} /></div>
          <h3>Live workflow</h3>
          <p>Upload → PDF extraction → Gemini analysis → deterministic readiness scoring → multi-agent recommendations.</p>
          <ul>
            <li><Check size={14} /> Evidence-based skills</li>
            <li><Check size={14} /> No hardcoded score</li>
            <li><Check size={14} /> Owner-scoped data</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}

function ResultsPage() {
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('skillbridge_assessment_id')
    if (id) getAssessment(id).then(setAssessment).catch((e) => setError(e instanceof Error ? e.message : 'Could not load assessment'))
    else setError('No assessment has been created yet.')
  }, [])

  if (error) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
        <EmptyState title="Assessment unavailable" detail="Upload and analyze a resume before creating an assessment." />
      </div>
    )
  }
  if (!assessment) return <LoadingPage label="Loading assessment..." />

  return (
    <div className="page">
      <Heading
        eyebrow="Assessment results"
        title="Your readiness snapshot"
        detail={`Deterministic assessment for ${assessment.targetRole}.`}
        action={<Button variant="secondary" onClick={() => window.location.assign('/agents')}><Sparkles size={16} /> Run AI agents</Button>}
      />

      <div className="result-hero panel">
        <div className="result-score">
          <div className="big-score">{assessment.readinessScore}<span>/100</span></div>
          <div className="result-label">
            <strong>{assessment.readinessLevel}</strong>
            <span>Calculated from resume evidence</span>
          </div>
        </div>
      </div>

      <div className="results-grid">
        <section className="panel breakdown">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Skill breakdown</p>
              <h2>Role readiness</h2>
            </div>
          </div>
          {assessment.skillBreakdown.map((skill) => (
            <div className="skill-bar" key={skill.skill}>
              <div>
                <strong>{skill.skill}</strong>
                <span>{skill.status} · evidence {skill.evidenceLevel}/3</span>
              </div>
              <div className="bar-track">
                <span
                  className={`bar-fill ${skill.status === 'Strong' ? 'teal' : 'orange'}`}
                  style={{ width: `${skill.weight ? (skill.score / skill.weight) * 100 : 0}%` }}
                />
              </div>
              <b>{skill.score}</b>
            </div>
          ))}
        </section>

        <section className="panel strengths">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Action plan</p>
              <h2>Gaps & recommendations</h2>
            </div>
          </div>
          <h4>Strengths</h4>
          {assessment.strengths.length ? (
            assessment.strengths.map((item) => <p className="result-item" key={item}><Check size={14} /> {item}</p>)
          ) : (
            <p className="muted">No strong skills recorded yet.</p>
          )}
          <h4>Recommendations</h4>
          {assessment.recommendations.map((item) => <p className="result-item" key={item}><Target size={14} /> {item}</p>)}
        </section>
      </div>
    </div>
  )
}

const agentLabels: Record<AgentName, string> = {
  skillGapAnalysis: 'Skill Gap Analyzer',
  jobFinder: 'Job Finder',
  learningRoadmap: 'Learning Roadmap',
}

function seconds(ms?: number) {
  return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`
}

function AgentsPage() {
  const assessmentId = localStorage.getItem('skillbridge_assessment_id')
  const { results, setResults, loading: loadingSaved, error: loadError } = useLatestAgentResults()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const execute = async () => {
    if (!assessmentId) {
      setError('Create an assessment before running agents.')
      return
    }
    setRunning(true)
    setError('')
    try {
      setResults(await runAgents(assessmentId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent workflow failed')
    } finally {
      setRunning(false)
    }
  }

  const failureFor = (agent: AgentName) => results?.failures.find((failure) => failure.agent === agent)?.error

  return (
    <div className="page">
      <Heading
        eyebrow="Multi-agent workspace"
        title="AI career agents"
        detail="Three LangGraph agents run in parallel: Skill Gap Analyzer and Learning Roadmap use Gemini, Job Finder searches a job board."
        action={
          <Button onClick={execute} disabled={running || !assessmentId}>
            {running && <LoaderCircle size={16} className="spin" />}
            {running ? 'Running 3 agents...' : results ? 'Run again' : 'Run agents'}
          </Button>
        }
      />

      {(error || loadError) && <ErrorBanner message={error || loadError} />}

      {!assessmentId && (
        <EmptyState
          title="Create an assessment first"
          detail="The agents work from your readiness assessment."
          action={<Button onClick={() => window.location.assign('/resume')}>Go to resume & role <ArrowRight size={15} /></Button>}
        />
      )}

      {assessmentId && !results && !running && !loadingSaved && (
        <EmptyState
          title="Agents are waiting"
          detail="Run the workflow to analyse your skill gaps, find matching jobs and build a 7-day roadmap, all at the same time."
        />
      )}

      {results && (
        <>
          <p className="muted agent-run-meta">
            <Clock size={13} /> Last run {new Date(results.createdAt).toLocaleString()} · all three finished in {seconds(results.timings?.totalMs)}
          </p>
          <div className="agent-grid">
            <AgentCard
              tone="violet"
              icon={<Radar size={19} />}
              agent="skillGapAnalysis"
              to="/skill-gaps"
              summary={results.skillGapAnalysis?.summary}
              error={failureFor('skillGapAnalysis')}
              time={results.timings?.skillGapAnalysis}
            >
              {results.skillGapAnalysis && (
                <p>{results.skillGapAnalysis.gaps.length} gaps · {results.skillGapAnalysis.quickWins.length} quick wins</p>
              )}
            </AgentCard>
            <AgentCard
              tone="orange"
              icon={<BriefcaseBusiness size={19} />}
              agent="jobFinder"
              to="/jobs"
              summary={results.jobFinder?.summary}
              error={failureFor('jobFinder')}
              time={results.timings?.jobFinder}
            >
              {results.jobFinder && (
                <p>{results.jobFinder.jobs.length} jobs · source: {results.jobFinder.source === 'adzuna' ? 'Adzuna (live)' : 'sample data'}</p>
              )}
            </AgentCard>
            <AgentCard
              tone="blue"
              icon={<Target size={19} />}
              agent="learningRoadmap"
              to="/roadmap"
              summary={results.learningRoadmap?.summary}
              error={failureFor('learningRoadmap')}
              time={results.timings?.learningRoadmap}
            >
              {results.learningRoadmap && <p>{results.learningRoadmap.roadmap.length}-day roadmap</p>}
            </AgentCard>
          </div>
        </>
      )}
    </div>
  )
}

function AgentCard({
  tone,
  icon,
  agent,
  to,
  summary,
  error,
  time,
  children,
}: {
  tone: 'blue' | 'violet' | 'orange'
  icon: ReactNode
  agent: AgentName
  to: string
  summary?: string
  error?: string
  time?: number
  children?: ReactNode
}) {
  return (
    <section className={`panel agent-card tone-${tone}`}>
      <div className="agent-card-top">
        <div className="agent-icon">{icon}</div>
        <span className="agent-time"><Clock size={12} /> {seconds(time)}</span>
      </div>
      <h2>{agentLabels[agent]}</h2>
      {error ? (
        <ErrorBanner message={`Failed: ${error}`} />
      ) : (
        <>
          <p className="muted">{summary}</p>
          {children}
          <NavLink className="text-link" to={to}>Open results <ArrowRight size={13} /></NavLink>
        </>
      )}
    </section>
  )
}

/** Loads the last saved agent run for the current assessment. Never triggers a new (paid) AI run. */
function useLatestAgentResults() {
  const [results, setResults] = useState<AgentResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('skillbridge_assessment_id')
    if (!id) {
      setLoading(false)
      return
    }
    let active = true
    getLatestAgents(id)
      .then((data) => {
        if (active) setResults(data)
      })
      .catch((e) => {
        // 404 just means the agents have not been run yet.
        if (active && !(e instanceof ApiError && e.status === 404)) setError(e instanceof Error ? e.message : 'Could not load agent results')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { results, setResults, loading, error }
}

/** Shared frame for the three agent result pages: handles loading, "not run yet" and agent failure. */
function AgentResultPage({
  eyebrow,
  title,
  detail,
  agent,
  children,
}: {
  eyebrow: string
  title: string
  detail: string
  agent: AgentName
  children: (results: AgentResults) => ReactNode
}) {
  const { results, loading, error } = useLatestAgentResults()
  const navigate = useNavigate()
  const failure = results?.failures.find((item) => item.agent === agent)
  const toAgents = <Button variant="secondary" onClick={() => navigate('/agents')}><Sparkles size={16} /> {results ? 'Run agents again' : 'Run agents'}</Button>

  let body: ReactNode
  if (loading) body = <LoadingPage label="Loading agent results..." />
  else if (!results) body = <EmptyState title="No results yet" detail="Run the AI agents first. Results are saved and shown here." action={toAgents} />
  else if (failure) body = <ErrorBanner message={`The ${agentLabels[agent]} failed on the last run: ${failure.error}`} />
  else body = children(results)

  return (
    <div className="page">
      <Heading eyebrow={eyebrow} title={title} detail={detail} action={results ? toAgents : undefined} />
      {error && <ErrorBanner message={error} />}
      {body}
    </div>
  )
}

function SkillGapsPage() {
  return (
    <AgentResultPage
      eyebrow="Skill gap analyzer"
      title="Where to improve first"
      detail="Your gaps for the target role, ranked by their impact on your readiness score."
      agent="skillGapAnalysis"
    >
      {(results) => {
        const analysis = results.skillGapAnalysis
        if (!analysis) return null
        return (
          <>
            <section className="panel gap-summary">
              <p>{analysis.summary}</p>
              {analysis.quickWins.length > 0 && (
                <>
                  <h4>Quick wins this week</h4>
                  <ul>
                    {analysis.quickWins.map((win) => (
                      <li key={win}><Zap size={13} /> {win}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            {analysis.gaps.length === 0 && <EmptyState title="No gaps found" detail="Every skill for this role already has strong evidence." />}
            {analysis.gaps.map((gap: SkillGap) => (
              <section className="panel gap-row" key={gap.skill}>
                <div className="gap-head">
                  <h3>{gap.skill}</h3>
                  <span className={`severity ${gap.severity.toLowerCase()}`}>{gap.severity}</span>
                </div>
                <p className="gap-levels">
                  {gap.currentLevel} → {gap.targetLevel} · about {gap.estimatedWeeks} week{gap.estimatedWeeks === 1 ? '' : 's'}
                </p>
                <p>{gap.whyItMatters}</p>
                <ul>
                  {gap.actions.map((action) => (
                    <li key={action}><Check size={13} /> {action}</li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )
      }}
    </AgentResultPage>
  )
}

function JobsPage() {
  return (
    <AgentResultPage
      eyebrow="Job finder"
      title="Jobs that fit you"
      detail="Openings ranked by how much of each job's skill list your resume already proves."
      agent="jobFinder"
    >
      {(results) => {
        const finder = results.jobFinder
        if (!finder) return null
        return (
          <>
            <p className="muted agent-run-meta">
              <BriefcaseBusiness size={13} />
              {finder.source === 'adzuna'
                ? `Live jobs from Adzuna · "${finder.query}" · ${finder.location}`
                : 'Sample jobs. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to backend/.env to search live listings.'}
            </p>
            {finder.jobs.length === 0 && <EmptyState title="No jobs found" detail="Try again later or change ADZUNA_LOCATION in backend/.env." />}
            {finder.jobs.map((job) => (
              <section className="panel job-row" key={job.id}>
                <div>
                  <h2>{job.title}</h2>
                  <p>{[job.company, job.location, job.contractType, job.salary].filter(Boolean).join(' · ')}</p>
                  {job.description && <p className="job-description">{job.description}</p>}
                  <div className="skill-chips">
                    {job.matchedSkills.map((skill) => (
                      <span className="chip have" key={skill}><Check size={11} /> {skill}</span>
                    ))}
                    {job.missingSkills.map((skill) => (
                      <span className="chip missing" key={skill}>{skill}</span>
                    ))}
                  </div>
                  {job.url && (
                    <a className="text-link" href={job.url} target="_blank" rel="noopener noreferrer">
                      View posting <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <strong>{job.matchPercentage}%<small>{job.eligibility}</small></strong>
              </section>
            ))}
          </>
        )
      }}
    </AgentResultPage>
  )
}

function RoadmapPage() {
  return (
    <AgentResultPage
      eyebrow="Learning roadmap"
      title="Your 7-day roadmap"
      detail="A practical week of study built from your biggest gaps."
      agent="learningRoadmap"
    >
      {(results) => {
        const roadmap = results.learningRoadmap
        if (!roadmap) return null
        return (
          <>
            <section className="panel gap-summary">
              <p>{roadmap.summary}</p>
            </section>
            {roadmap.roadmap.map((day) => (
              <section className="panel roadmap-row" key={day.day}>
                <b>Day {day.day}</b>
                <div>
                  <h3>{day.topic}</h3>
                  <p>{day.tasks.join(' · ')}</p>
                  <small>{day.estimatedHours}h · {day.priority} · {day.reason}</small>
                </div>
              </section>
            ))}
          </>
        )
      }}
    </AgentResultPage>
  )
}

/* ------------------------------------------------------------------ */
/* Shared components and helpers                                       */
/* ------------------------------------------------------------------ */

function Heading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="heading-detail">{detail}</p>
      </div>
      {action}
    </div>
  )
}

function Button({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button className={`button ${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <section className="panel empty-state">
      <FileText size={25} />
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner">
      <CircleHelp size={16} />
      {message}
    </div>
  )
}

function LoadingPage({ label }: { label: string }) {
  return (
    <div className="loading-page">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default App
