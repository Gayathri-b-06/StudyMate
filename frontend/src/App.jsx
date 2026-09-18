import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { WorkspaceProvider } from './context/WorkspaceContext'
import AppNavigation from './components/layout/AppNavigation'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from './components/auth/ProtectedRoute'
import ProjectWorkspace from './components/workspace/ProjectWorkspace'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import HomePage from './pages/HomePage'
import SpacesPage from './pages/SpacesPage'
import SpaceDetailPage from './pages/SpaceDetailPage'
import AdminPage from './pages/AdminPage'
import GlobalAnalyticsPage from './pages/GlobalAnalyticsPage'

function ProjectRedirect() {
  const { projectId } = useParams()
  return <Navigate to={`/projects/${projectId}/overview`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <AppNavigation>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnlyRoute>
                  <SignupPage />
                </PublicOnlyRoute>
              }
            />

            {/* Protected Routes */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/spaces"
              element={
                <ProtectedRoute>
                  <SpacesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <GlobalAnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route
              path="/spaces/:spaceId"
              element={
                <ProtectedRoute>
                  <SpaceDetailPage tab="overview" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/spaces/:spaceId/:tab"
              element={
                <ProtectedRoute>
                  <SpaceDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/overview"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="overview" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/chat"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="chat" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/documents"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="documents" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/quiz"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="quiz" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/flashcards"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="flashcards" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/progress"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="progress" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/analytics"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="progress" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/study-plan"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace tool="planner" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/*"
              element={
                <ProtectedRoute>
                  <ProjectWorkspace />
                </ProtectedRoute>
              }
            />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </AppNavigation>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
