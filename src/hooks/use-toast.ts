'use client';

import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useToast = () => {
  const show = (type: ToastType, message: string, options?: ToastOptions) => {
    const toastFn = {
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
    }[type];

    if (options?.description || options?.title) {
      toastFn(options.title || message, {
        description: options.description,
        duration: options.duration || 4000,
        action: options.action,
      });
    } else {
      toastFn(message, {
        duration: options?.duration || 4000,
        action: options?.action,
      });
    }
  };

  return {
    success: (message: string, options?: ToastOptions) => show('success', message, options),
    error: (message: string, options?: ToastOptions) => show('error', message, options),
    warning: (message: string, options?: ToastOptions) => show('warning', message, options),
    info: (message: string, options?: ToastOptions) => show('info', message, options),
    promise: <T,>(
      promise: Promise<T>,
      {
        loading,
        success,
        error,
      }: {
        loading: string;
        success: (data: T) => string;
        error: (error: Error) => string;
      }
    ) => {
      return toast.promise(promise, {
        loading,
        success,
        error,
      });
    },
  };
};
