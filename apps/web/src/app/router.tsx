import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthUser } from '@/lib/authStore';
import Landing from '@/pages/Landing';
import { SignIn, SignUp } from '@/pages/Auth';
import { AppShell } from '@/pages/app/AppShell';
import Overview from '@/pages/app/Overview';
import Chat from '@/pages/app/Chat';
import NotFound from '@/pages/NotFound';

function RequireAuth() {
  const user = useAuthUser();
  const loc = useLocation();
  return user ? <Outlet /> : <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
}

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/signin', element: <SignIn /> },
  { path: '/signup', element: <SignUp /> },
  {
    element: <RequireAuth />,
    children: [{ path: '/app', element: <AppShell />, children: [{ index: true, element: <Overview /> }, { path: 'chat', element: <Chat /> }, { path: 'care', element: <Navigate to="/app" replace /> }, { path: 'settings', element: <Navigate to="/app" replace /> }] }],
  },
  { path: '*', element: <NotFound /> },
]);
