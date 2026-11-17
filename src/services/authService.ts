import { apiRequest } from './api'

export interface User { id: string; fullName: string; email: string; targetRole?: string; createdAt: string; updatedAt: string }
interface AuthResponse { token: string; user: User }
export async function login(email: string, password: string): Promise<User> { const response = await apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('skillbridge_token', response.token); return response.user }
export async function signup(input: { fullName: string; email: string; password: string; targetRole?: string }): Promise<User> { const response = await apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }); localStorage.setItem('skillbridge_token', response.token); return response.user }
export async function getMe(): Promise<User> { const response = await apiRequest<{ user: User }>('/auth/me'); return response.user }
export function logout(): void { localStorage.removeItem('skillbridge_token'); window.dispatchEvent(new Event('skillbridge:logout')) }