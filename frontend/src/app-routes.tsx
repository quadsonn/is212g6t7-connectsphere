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
import { CoordinatorVenues } from '@/pages/coordinator-venues';
import { CoordinatorVenueDetail } from '@/pages/coordinator-venue-detail';
import { CoordinatorBookings } from '@/pages/coordinator-bookings';
import { CoordinatorBookingDetail } from '@/pages/coordinator-booking-detail';
import { VenueDashboard } from '@/pages/venue-dashboard';
import { EquipmentDashboard } from '@/pages/equipment-dashboard';
import { EquipmentCatalogue } from '@/pages/equipment-catalogue';
import { EquipmentDetail } from '@/pages/equipment-detail';
import { EquipmentAvailability } from '@/pages/equipment-availability';
import { EquipmentEventRequirements } from '@/pages/equipment-event-requirements';
import { EquipmentEventDetails } from '@/pages/equipment-event-details';
import { EquipmentReleased } from '@/pages/equipment-released';
import { AttendeeDashboard } from '@/pages/attendee-dashboard';
import { AttendeeRegistrations } from '@/pages/attendee-registrations';
import { VenueNewRequest } from '@/pages/venue-new-request';
import { VenueEditRequest } from '@/pages/venue-edit-request';
import { LeadAssignments } from '@/pages/lead-assignments';
import { LeadQueuedRequest } from '@/pages/lead-queued-request';
import { LeadUnassignedQueue } from '@/pages/lead-unassigned-queue';
import { SafetyQueue } from '@/pages/safety-queue';
import { SafetyReview } from '@/pages/safety-review';
import { RelatedEventDetail, RelatedEventsList } from '@/pages/related-events';
import { VenueBookingQueue } from '@/pages/venue-booking-queue';
import { VenueBookingDetail } from '@/pages/venue-booking-detail';
import { VenueCalendar } from '@/pages/venue-calendar';
import { CoordinatorChangeRequests } from '@/pages/coordinator-change-requests';
import { CoordinatorChangeRequestDetail } from '@/pages/coordinator-change-request-detail';
import { NotificationsPage } from '@/pages/notifications';

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
          {/* Notifications page: every role reads its own (the API scopes it). */}
          <Route path="/notifications" element={<NotificationsPage />} />

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
            <Route path="/coordinator/change-requests" element={<CoordinatorChangeRequests />} />
            <Route
              path="/coordinator/change-requests/:id"
              element={<CoordinatorChangeRequestDetail />}
            />
            <Route path="/coordinator/venues" element={<CoordinatorVenues />} />
            <Route path="/coordinator/venues/:id" element={<CoordinatorVenueDetail />} />
            <Route path="/coordinator/bookings" element={<CoordinatorBookings />} />
            <Route path="/coordinator/bookings/:id" element={<CoordinatorBookingDetail />} />
          </Route>

          <Route element={<ProtectedRoute allow={['VENUE_STAFF']} />}>
            <Route path="/venues" element={<VenueDashboard />} />
            <Route path="/venues/new" element={<VenueNewRequest />} />
            <Route path="/venues/:id/edit" element={<VenueEditRequest />} />
            <Route path="/venues/events" element={<RelatedEventsList basePath="/venues/events" />} />
            <Route
              path="/venues/events/:id"
              element={<RelatedEventDetail basePath="/venues/events" />}
            />
            <Route path="/venues/bookings" element={<VenueBookingQueue />} />
            <Route path="/venues/bookings/:id" element={<VenueBookingDetail />} />
            <Route path="/venues/calendar" element={<VenueCalendar />} />
          </Route>

          <Route element={<ProtectedRoute allow={['TECHNICAL_SUPPORT_STAFF']} />}>
            <Route path="/equipment" element={<EquipmentDashboard />} />
            <Route path="/equipment/inventory" element={<EquipmentCatalogue />} />
            <Route path="/equipment/inventory/:id" element={<EquipmentDetail />} />
            <Route path="/equipment/availability" element={<EquipmentAvailability />} />
            <Route path="/equipment/requirements/:eventId" element={<EquipmentEventRequirements />} />
            <Route path="/equipment/requirements/:eventId/details" element={<EquipmentEventDetails />} />
            <Route path="/equipment/released" element={<EquipmentReleased />} />
          </Route>

          <Route element={<ProtectedRoute allow={['EVENT_COORDINATOR_LEAD']} />}>
            <Route path="/lead" element={<Navigate to="/lead/unassigned" replace />} />
            <Route path="/lead/unassigned" element={<LeadUnassignedQueue />} />
            <Route path="/lead/unassigned/:id" element={<LeadQueuedRequest />} />
            <Route path="/lead/assignments" element={<LeadAssignments />} />
          </Route>

          <Route element={<ProtectedRoute allow={['SAFETY_OFFICER']} />}>
            <Route path="/safety" element={<Navigate to="/safety/checks" replace />} />
            <Route path="/safety/checks" element={<SafetyQueue />} />
            <Route path="/safety/checks/:id" element={<SafetyReview />} />
          </Route>

          <Route element={<ProtectedRoute allow={['ATTENDEE']} />}>
            <Route path="/events" element={<AttendeeDashboard />} />
            <Route path="/events/mine" element={<AttendeeRegistrations />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
