import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, User, LogOut, Heart, Tag, MessageCircle, BarChart3, Search, MapPin } from 'lucide-react';
import { useState } from 'react';

const Header = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinks = [
    { to: '/', label: 'Home', icon: MapPin },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/deals', label: 'Deals', icon: Tag },
  ];

  const authLinks = [
    { to: '/favorites', label: 'Favorites', icon: Heart },
    { to: '/ai', label: 'AI Assistant', icon: MessageCircle },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass glass-shadow">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <MapPin className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">LocalDiscover</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Button key={to} variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground hover:bg-white/5">
              <Link to={to} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            </Button>
          ))}
          {isAuthenticated &&
            authLinks.map(({ to, label, icon: Icon }) => (
              <Button key={to} variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground hover:bg-white/5">
                <Link to={to} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              </Button>
            ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 glass-subtle rounded-full px-3">
                  <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-sm">{user?.firstName || user?.email?.split('@')[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/favorites')}>
                  <Heart className="mr-2 h-4 w-4" /> Favorites
                </DropdownMenuItem>
                {user?.isAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link to="/login">Login</Link>
              </Button>
              <Button size="sm" asChild className="gradient-primary border-0 hover:opacity-90 transition-opacity">
                <Link to="/register">Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile nav */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="hover:bg-white/5">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 glass-strong border-l-0">
            <nav className="flex flex-col gap-1 mt-8">
              {navLinks.map(({ to, label, icon: Icon }) => (
                <Button key={to} variant="ghost" className="justify-start hover:bg-white/5" asChild onClick={() => setMobileOpen(false)}>
                  <Link to={to}><Icon className="mr-2 h-4 w-4" />{label}</Link>
                </Button>
              ))}
              {isAuthenticated && (
                <>
                  {authLinks.map(({ to, label, icon: Icon }) => (
                    <Button key={to} variant="ghost" className="justify-start hover:bg-white/5" asChild onClick={() => setMobileOpen(false)}>
                      <Link to={to}><Icon className="mr-2 h-4 w-4" />{label}</Link>
                    </Button>
                  ))}
                  <Button variant="ghost" className="justify-start hover:bg-white/5" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/profile"><User className="mr-2 h-4 w-4" />Profile</Link>
                  </Button>
                  <div className="border-t border-white/10 my-2" />
                  <Button variant="ghost" className="justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { handleLogout(); setMobileOpen(false); }}>
                    <LogOut className="mr-2 h-4 w-4" />Logout
                  </Button>
                </>
              )}
              {!isAuthenticated && (
                <>
                  <div className="border-t border-white/10 my-2" />
                  <Button variant="ghost" className="justify-start" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/login">Login</Link>
                  </Button>
                  <Button className="justify-start gradient-primary border-0" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/register">Sign Up</Link>
                  </Button>
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default Header;
