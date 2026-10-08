import { useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { SidebarSlotContext } from './sidebar-slot-context';

/**
 * Renders its children in AppShell's sidebar, under the nav. Only while
 * mounted: navigating away removes the content and restores the sidebar.
 *
 * The sidebar is hidden below `md`, so callers render this only on wider
 * screens (see useMediaQuery) and show their content inline otherwise.
 */
export function SidebarPortal({ children }: { children: React.ReactNode }) {
  const slot = useContext(SidebarSlotContext);

  useEffect(() => {
    slot?.setActive(true);
    return () => slot?.setActive(false);
  }, [slot]);

  return slot?.node ? createPortal(children, slot.node) : null;
}
