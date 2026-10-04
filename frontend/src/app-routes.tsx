import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/app-shell';
import { HOME_BY_ROLE } from '@/components/layout/nav-config';
import { ProtectedRoute } from '@/features/auth/components/protected-route';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { LoginPage } from '@/pages/login-page';
import { OrganiserDashboard } from '@/pages/organiser-dashboard';
import { OrganiserNewRequest } from '@/pages/organiser-new-request';
import { OrganiserRequestDetail } from '@/pages/organiser-request-detail';
import { CoordinatorDashboard } from '@/pages/coordinator-dashboard';
import { CoordinatorEventDetail } from '@/pages/coordinator-event-detail';
import { CoordinatorBookings } from '@/pages/coordinator-bookings';
import { CoordinatorBookingDetail } from '@/pages/coordinator-booking-detail';
import { VenueDashboard } from '@/pages/venue-dashboard';
import { EquipmentDashboard } from '@/pages/equipment-dashboard';
import { AttendeeDashboard } from '@/pages/attendee-dashboard';
import { VenueNewRequest } from '@/pages/venue-new-request';
import { VenueEditRequest } from '@/pages/venue-edit-request';
import { VenueBookingQueue } from '@/pages/venue-booking-queue';
import { VenueBookingDetail } from '@/pages/venue-booking-detail';
import { VenueCalendar } from '@/pages/venue-calendar';

/** Sends a signed-in user to their role's dashboard; everyone else to login. */
function RoleHome() {
  const { session } = useAuth();
  return <Navigate to={session ? HOME_BY_ROLE[session.role] : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<RoleHome />} />

          {/*
            Each dashboard is additionally restricted to its role. This is
            navigation hygiene only — the API enforces the real rules, and a
            user who reaches the wrong screen still sees nothing.
          */}
          <Route element={<ProtectedRoute allow={['EVENT_ORGANISER']} />}>
            <Route path="/organiser" element={<OrganiserDashboard />} />
            <Route path="/organiser/new" element={<OrganiserNewRequest />} />
            <Route path="/organiser/:id" element={<OrganiserRequestDetail />} />
            <Route path="/organiser/:id/edit" element={<OrganiserNewRequest />} />
          </Route>

          <Route element={<ProtectedRoute allow={['EVENT_COORDINATOR']} />}>
            <Route path="/coordinator" element={<CoordinatorDashboard />} />
            <Route path="/coordinator/events/:id" element={<CoordinatorEventDetail />} />
            <Route path="/coordinator/bookings" element={<CoordinatorBookings />} />
            <Route path="/coordinator/bookings/:id" element={<CoordinatorBookingDetail />} />
          </Route>

          <Route element={<ProtectedRoute allow={['VENUE_STAFF']} />}>
            <Route path="/venues" element={<VenueDashboard />} />
            <Route path="/venues/new" element={<VenueNewRequest />} />
            <Route path="/venues/:id/edit" element={<VenueEditRequest />} />
            <Route path="/venues/bookings" element={<VenueBookingQueue />} />
            <Route path="/venues/bookings/:id" element={<VenueBookingDetail />} />
            <Route path="/venues/calendar" element={<VenueCalendar />} />
          </Route>

          <Route element={<ProtectedRoute allow={['TECHNICAL_SUPPORT_STAFF']} />}>
            <Route path="/equipment" element={<EquipmentDashboard />} />
          </Route>

          <Route element={<ProtectedRoute allow={['ATTENDEE']} />}>
            <Route path="/events" element={<AttendeeDashboard />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
