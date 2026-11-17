import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const devEnv = { ...process.env, DISABLE_AUTH: 'true', VITE_DISABLE_AUTH: 'true' }
const vite = spawn(npmCommand, ['exec', 'vite'], { stdio: 'inherit', shell: process.platform === 'win32', env: devEnv })
const backend = spawn(npmCommand, ['run', 'dev'], { cwd: 'backend', stdio: 'inherit', shell: process.platform === 'win32', env: devEnv })

function stop() {
  if (!vite.killed) vite.kill()
  if (!backend.killed) backend.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
vite.on('exit', (code) => {
  if (!backend.killed) backend.kill()
  process.exit(code ?? 0)
})
backend.on('exit', (code) => {
  if (code && !vite.killed) vite.kill()
})
