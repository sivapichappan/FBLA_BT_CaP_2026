/**
 * Root component. Order of wrappers, outermost first:
 *   AuthProvider   — user/token state for everything below;
 *   MotionConfig   — reducedMotion="user" disables ALL motion/react animation
 *                    for people with prefers-reduced-motion set (§14);
 *   ErrorBoundary  — a crash in any routed page becomes a recovery card (§13).
 * The skip link is the first focusable element on every page (WCAG 2.4.1).
 */

import { MotionConfig } from "motion/react";
import { Link, Route, Routes } from "react-router-dom";
import { ConciergeWidget } from "./components/ConciergeWidget";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { EmptyState } from "./components/ui";
import { AuthProvider } from "./lib/auth";
import { BusinessDetail } from "./routes/BusinessDetail";
import { Deals } from "./routes/Deals";
import { Discover } from "./routes/Discover";
import { Favorites } from "./routes/Favorites";
import { Login } from "./routes/Login";
import { AddBusiness } from "./routes/owner/AddBusiness";
import { OwnerDashboard } from "./routes/owner/Dashboard";
import { EditBusiness } from "./routes/owner/EditBusiness";
import { PostDeal } from "./routes/owner/PostDeal";
import { Verify } from "./routes/owner/Verify";
import { Plan } from "./routes/Plan";
import { Profile } from "./routes/Profile";
import { Register } from "./routes/Register";
import { Search } from "./routes/Search";

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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent-700 focus:px-4 focus:py-2 focus:font-serif focus:text-cream"
        >
          Skip to content
        </a>
        <div className="min-h-screen">
          <Header />
          {/* id="main" is the skip-link target; each page renders its own <main>. */}
          <div id="main">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Discover />} />
                <Route path="/search" element={<Search />} />
                <Route path="/business/:ref" element={<BusinessDetail />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/deals" element={<Deals />} />
                <Route path="/plan" element={<Plan />} />
                <Route path="/owner" element={<OwnerDashboard />} />
                <Route path="/owner/add-business" element={<AddBusiness />} />
                <Route path="/owner/post-deal" element={<PostDeal />} />
                <Route path="/owner/edit/:id" element={<EditBusiness />} />
                <Route path="/owner/verify" element={<Verify />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </div>
          <ConciergeWidget />
        </div>
      </MotionConfig>
    </AuthProvider>
  );
}
