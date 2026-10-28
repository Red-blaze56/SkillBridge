import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import History from './pages/history.tsx'
import Home from './pages/home.tsx'
import Interview from './pages/interview.tsx'
import Login from './pages/login.tsx'
import Register from './pages/register.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Everything inside needs a logged-in user. */}
      <Route element={<ProtectedRoute />}>
        {/* Pages that show the header and sidebar. */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/history" element={<History />} />
        </Route>
        {/* Full-screen interview, outside AppLayout (placeholder until the chat is built). */}
        <Route path="/interviews/:id" element={<Interview />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
