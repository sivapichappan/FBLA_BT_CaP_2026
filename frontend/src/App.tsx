/**
 * Root component. Order of wrappers, outermost first:
 *   AuthProvider   — user/token state for everything below;
 *   MotionConfig   — reducedMotion="user" disables ALL motion/react animation
 *                    for people with prefers-reduced-motion set (§14);
 *   ErrorBoundary  — a crash in any routed page becomes a recovery card (§13).
 * The skip link is the first focusable element on every page (WCAG 2.4.1).
 */

import { MotionConfig } from "motion/react";
import { useEffect, useRef } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ConciergeWidget } from "./components/ConciergeWidget";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { Onboarding } from "./components/Onboarding";
import { ScrollProgress } from "./components/ScrollProgress";
import { EmptyState } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import { BusinessDetail } from "./routes/BusinessDetail";
import { Deals } from "./routes/Deals";
import { Discover } from "./routes/Discover";
import { Favorites } from "./routes/Favorites";
import { Login } from "./routes/Login";
import { AddBusiness } from "./routes/owner/AddBusiness";
import { CheckinKiosk } from "./routes/owner/CheckinKiosk";
import { OwnerDashboard } from "./routes/owner/Dashboard";
import { EditBusiness } from "./routes/owner/EditBusiness";
import { PostDeal } from "./routes/owner/PostDeal";
import { Verify } from "./routes/owner/Verify";
import { MyReport } from "./routes/MyReport";
import { Passport } from "./routes/Passport";
import { Plan } from "./routes/Plan";
import { SharedTrip } from "./routes/SharedTrip";
import { Profile } from "./routes/Profile";
import { Register } from "./routes/Register";
import { Search } from "./routes/Search";

/** Move keyboard/screen-reader focus to the main content on navigation, so the
 *  next page's content is announced instead of focus being stranded on a button
 *  that's now gone. Skips the initial mount (the skip link stays the natural
 *  first stop on first load). WCAG 2.4.3 / SPA focus management. */
function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="container-page py-16">
      <EmptyState title="Page not found">
        Head back to{" "}
        <Link to="/" className="text-accent-700 underline">
          Discover
        </Link>{" "}
        — everything starts there.
      </EmptyState>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MotionConfig reducedMotion="user">
        <ScrollProgress />
        <RouteFocus />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent-700 focus:px-4 focus:py-2 focus:font-serif focus:text-cream"
        >
          Skip to content
        </a>
        {/* overflow-x-clip is a no-horizontal-scroll backstop: it uses `clip`
            (not `hidden`) so the desktop sticky map + skip-link are unaffected,
            and the intentional inner overflow-x-auto regions still scroll. */}
        <div className="min-h-screen overflow-x-clip">
          <Header />
          {/* id="main" is the skip-link target + the route-change focus target;
              tabIndex=-1 makes it programmatically focusable, outline-none keeps
              that from drawing a ring around the whole page. */}
          <div id="main" tabIndex={-1} className="outline-none">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Discover />} />
                <Route path="/search" element={<Search />} />
                <Route path="/business/:ref" element={<BusinessDetail />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/passport" element={<Passport />} />
                <Route path="/impact" element={<MyReport />} />
                <Route path="/deals" element={<Deals />} />
                <Route path="/plan" element={<Plan />} />
                <Route path="/trip/shared/:token" element={<SharedTrip />} />
                <Route path="/owner" element={<OwnerDashboard />} />
                <Route path="/owner/add-business" element={<AddBusiness />} />
                <Route path="/owner/post-deal" element={<PostDeal />} />
                <Route path="/owner/edit/:id" element={<EditBusiness />} />
                <Route path="/owner/verify" element={<Verify />} />
                <Route path="/owner/checkin-code" element={<CheckinKiosk />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </div>
          <ConciergeWidget />
          <Onboarding />
        </div>
      </MotionConfig>
    </AuthProvider>
  );
}
