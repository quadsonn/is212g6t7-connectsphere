import { createContext } from 'react';

/**
 * Lets a page render extra content into AppShell's left sidebar, beneath the
 * nav (US-18's venue filters). `node` is where it goes; `setActive` tells the
 * shell to widen the sidebar while something is there.
 */
export interface SidebarSlot {
  node: HTMLElement | null;
  setActive: (active: boolean) => void;
}

export const SidebarSlotContext = createContext<SidebarSlot | null>(null);
