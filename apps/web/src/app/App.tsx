import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from './router';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000, refetchOnWindowFocus: true } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
        <Toaster position="bottom-right" toastOptions={{ classNames: { toast: '!rounded-md !border !border-line !bg-surface !text-ink !shadow-e2 !font-sans' } }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
