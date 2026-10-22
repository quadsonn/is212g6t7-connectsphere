import type { Role } from '@/types/api';

export interface RoleTheme {
  /** The thin strip across the top of the header. */
  strip: string;
  /** The role badge next to the user's name. */
  badge: string;
  /** The avatar circle. */
  avatar: string;
  /** The selected item in the side nav. */
  navActive: string;
}

/**
 * One colour per role, so it is obvious at a glance whose account is in use
 * (testers switch roles a lot). Only the app frame uses it — header strip,
 * role badge, avatar and the selected nav item; pages keep the brand colours.
 *
 * Red, amber and green are left out on purpose: the app already uses them for
 * errors, warnings and approved statuses. Class names are written out in full
 * so Tailwind finds them.
 */
export const ROLE_THEME: Record<Role, RoleTheme> = {
  EVENT_ORGANISER: {
    strip: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-800 ring-indigo-300',
    avatar: 'bg-indigo-100 text-indigo-800',
    navActive: 'bg-indigo-50 text-indigo-800 border-indigo-500',
  },
  EVENT_COORDINATOR: {
    strip: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-800 ring-blue-300',
    avatar: 'bg-blue-100 text-blue-800',
    navActive: 'bg-blue-50 text-blue-800 border-blue-500',
  },
  EVENT_COORDINATOR_LEAD: {
    strip: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-800 ring-violet-300',
    avatar: 'bg-violet-100 text-violet-800',
    navActive: 'bg-violet-50 text-violet-800 border-violet-500',
  },
  VENUE_STAFF: {
    strip: 'bg-teal-500',
    badge: 'bg-teal-50 text-teal-800 ring-teal-300',
    avatar: 'bg-teal-100 text-teal-800',
    navActive: 'bg-teal-50 text-teal-800 border-teal-500',
  },
  TECHNICAL_SUPPORT_STAFF: {
    strip: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-800 ring-orange-300',
    avatar: 'bg-orange-100 text-orange-800',
    navActive: 'bg-orange-50 text-orange-800 border-orange-500',
  },
  SAFETY_OFFICER: {
    strip: 'bg-yellow-400',
    badge: 'bg-yellow-50 text-yellow-800 ring-yellow-400',
    avatar: 'bg-yellow-100 text-yellow-800',
    navActive: 'bg-yellow-50 text-yellow-800 border-yellow-400',
  },
  ATTENDEE: {
    strip: 'bg-pink-500',
    badge: 'bg-pink-50 text-pink-800 ring-pink-300',
    avatar: 'bg-pink-100 text-pink-800',
    navActive: 'bg-pink-50 text-pink-800 border-pink-500',
  },
};
