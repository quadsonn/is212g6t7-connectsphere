import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Building2,
  ShieldCheck,
  Users,
  MapPin,
  Repeat2,
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
    { label: 'Change requests', to: '/coordinator/change-requests', icon: Repeat2 },
    { label: 'My venue requests', to: '/coordinator/bookings', icon: MapPin },
    { label: 'All events', to: '/coordinator/events', icon: CalendarCheck, comingSoon: true },
    { label: 'Venues', to: '/coordinator/venues', icon: Building2 },
  ],
  VENUE_STAFF: [
    { label: 'Venue catalogue', to: '/venues', icon: Building2 },
    { label: 'Related events', to: '/venues/events', icon: CalendarCheck },
    { label: 'Booking requests', to: '/venues/bookings', icon: CalendarCheck },
    { label: 'Availability calendar', to: '/venues/calendar', icon: CalendarDays },
  ],
  TECHNICAL_SUPPORT_STAFF: [
    { label: 'Event requirements', to: '/equipment', icon: ClipboardList },
    { label: 'Equipment catalogue', to: '/equipment/inventory', icon: Wrench },
    { label: 'Check availability', to: '/equipment/availability', icon: CalendarClock },
    { label: 'Released reservations', to: '/equipment/released', icon: CalendarX },
  ],
  ATTENDEE: [
    { label: 'Browse events', to: '/events', icon: Ticket },
    { label: 'My registrations', to: '/events/mine', icon: CalendarCheck },
  ],
  // Requirement changes 5 and 6 — accounts exist; screens are to come.
  EVENT_COORDINATOR_LEAD: [
    { label: 'Unassigned queue', to: '/lead/unassigned', icon: ClipboardList },
    { label: 'Coordinator assignments', to: '/lead/assignments', icon: Users },
  ],
  SAFETY_OFFICER: [
    { label: 'Safety checks', to: '/safety/checks', icon: ShieldCheck },
  ],
};

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  EVENT_ORGANISER: '/organiser',
  EVENT_COORDINATOR: '/coordinator',
  VENUE_STAFF: '/venues',
  TECHNICAL_SUPPORT_STAFF: '/equipment',
  ATTENDEE: '/events',
  EVENT_COORDINATOR_LEAD: '/lead',
  SAFETY_OFFICER: '/safety',
};
