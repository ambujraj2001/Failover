import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { FullPageLoader, RequireAnon, RequireAuth } from '@/components/layout/guards'
import { refreshSession } from '@/lib/api'
import { useAuth } from '@/stores/auth'

const Landing = lazy(() => import('@/pages/Landing'))
const SignIn = lazy(() => import('@/pages/auth/SignIn'))
const SignUp = lazy(() => import('@/pages/auth/SignUp'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Path = lazy(() => import('@/pages/Path'))
const Lesson = lazy(() => import('@/pages/Lesson'))
const Practice = lazy(() => import('@/pages/Practice'))
const LabPage = lazy(() => import('@/pages/LabPage'))
const Interviews = lazy(() => import('@/pages/Interviews'))
const InterviewRoom = lazy(() => import('@/pages/InterviewRoom'))
const Concepts = lazy(() => import('@/pages/Concepts'))
const CheatSheet = lazy(() => import('@/pages/CheatSheet'))
const Flashcards = lazy(() => import('@/pages/Flashcards'))
const Tracks = lazy(() => import('@/pages/Tracks'))
const Settings = lazy(() => import('@/pages/Settings'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function Root() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <ScrollRestoration />
      <Outlet />
    </Suspense>
  )
}

const authed = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>
const anon = (el: React.ReactNode) => <RequireAnon>{el}</RequireAnon>

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/signin', element: anon(<SignIn />) },
      { path: '/signup', element: anon(<SignUp />) },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/welcome', element: authed(<Onboarding />) },
      { path: '/lab/:slug', element: authed(<LabPage />) },
      { path: '/interview/:id', element: authed(<InterviewRoom />) },
      {
        path: '/app',
        element: authed(<AppShell />),
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'path', element: <Path /> },
          { path: 'lessons/:slug', element: <Lesson /> },
          { path: 'practice', element: <Practice /> },
          { path: 'interviews', element: <Interviews /> },
          { path: 'concepts', element: <Concepts /> },
          { path: 'cheatsheet', element: <CheatSheet /> },
          { path: 'flashcards', element: <Flashcards /> },
          { path: 'tracks', element: <Tracks /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  useEffect(() => {
    // restore the session from the httpOnly refresh cookie
    refreshSession().then((ok) => {
      if (!ok) useAuth.getState().clear()
    })
  }, [])
  return <RouterProvider router={router} />
}
