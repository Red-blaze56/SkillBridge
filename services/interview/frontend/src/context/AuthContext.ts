import { createContext } from 'react'
import type { User } from '../api/auth'

export interface AuthContextValue {
  user: User | null
  loading: boolean // true until the first session check has finished
  error: string | null // set when the first session check could not complete
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

// null = "no <AuthProvider> above this component"; useAuth() turns that into a clear error.
export const AuthContext = createContext<AuthContextValue | null>(null)