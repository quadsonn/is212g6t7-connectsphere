import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * shadcn's Sonner wrapper, minus next-themes (the app has no theme switcher).
 * Mounted once in App; call `toast.success(...)` from 'sonner' anywhere.
 */
export function Toaster(props: ToasterProps) {
  return <Sonner position="top-right" richColors closeButton {...props} />;
}
