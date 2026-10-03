import {
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  Building2,
  Wrench,
  Ticket,
} from 'lucide-react';
import type { Role } from '@/types/api';

export interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  /** Rendered but disabled — the screen is not built yet. */
  comingSoon?: boolean;
}

/**
 * The left nav per role.
 *
 * This decides what is *shown*; it is not an authorisation mechanism. The
 * server's permission matrix is the only thing that decides what a user may
 * actually do. Once GET /auth/me/permissions drives this, the two will be
 * derived from one table — see the README.
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  EVENT_ORGANISER: [
    { label: 'My requests', to: '/organiser', icon: LayoutDashboard },
  ],
  EVENT_COORDINATOR: [
    { label: 'Review queue', to: '/coordinator', icon: ClipboardList },
    { label: 'All events', to: '/coordinator/events', icon: CalendarCheck, comingSoon: true },
    { label: 'Venues', to: '/coordinator/venues', icon: Building2 },
  ],
  VENUE_STAFF: [
    { label: 'Venue catalogue', to: '/venues', icon: Building2 },
    { label: 'Booking requests', to: '/venues/bookings', icon: CalendarCheck, comingSoon: true },
  ],
  TECHNICAL_SUPPORT_STAFF: [
    { label: 'Equipment requests', to: '/equipment', icon: ClipboardList },
    { label: 'Inventory', to: '/equipment/inventory', icon: Wrench, comingSoon: true },
  ],
  ATTENDEE: [
    { label: 'Browse events', to: '/events', icon: Ticket },
    { label: 'My registrations', to: '/events/mine', icon: CalendarCheck, comingSoon: true },
  ],
};

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  EVENT_ORGANISER: '/organiser',
  EVENT_COORDINATOR: '/coordinator',
  VENUE_STAFF: '/venues',
  TECHNICAL_SUPPORT_STAFF: '/equipment',
  ATTENDEE: '/events',
};
