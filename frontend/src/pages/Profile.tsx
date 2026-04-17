import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { api, favoriteApi } from '../services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BlurFade from '@/components/ui/blur-fade';
import {
  User, Mail, MapPin, Trophy, Star, Calendar, Heart, MessageSquare,
  Shield, LogOut, ChevronRight,
} from 'lucide-react';

interface ProfileData {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  profile_image_url: string | null;
  default_city: string | null;
  default_state: string | null;
  trust_score: number;
  total_points: number;
  level: number;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
}

const Profile = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const { location } = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState({ favorites: 0, reviews: 0 });
  const [, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) loadProfile();
  }, [isAuthenticated]);

  const loadProfile = async () => {
    try {
      const [profileRes, favsRes] = await Promise.all([
        api.get('/auth/profile'),
        favoriteApi.getAll().catch(() => ({ data: { favorites: [] } })),
      ]);
      setProfile(profileRes.data.user);
      setStats({ favorites: favsRes.data.favorites?.length || 0, reviews: 0 });
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <BlurFade>
          <div className="glass rounded-xl p-12 max-w-md mx-auto">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view your profile</h2>
            <p className="text-sm text-muted-foreground mb-6">Track your favorites, reviews, and activity.</p>
            <Button onClick={() => navigate('/login')} className="gradient-primary border-0">Sign In</Button>
          </div>
        </BlurFade>
      </div>
    );
  }

  const p = profile;
  const initials = p
    ? (p.first_name?.[0] || '') + (p.last_name?.[0] || '')
    : user.email[0].toUpperCase();
  const displayName = p
    ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username
    : user.firstName || user.email.split('@')[0];

  const levelProgress = ((p?.total_points || 0) % 100);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header card */}
      <BlurFade delay={0}>
        <div className="glass rounded-2xl p-6 mb-4 relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-accent/8 blur-3xl" />
          </div>

          <div className="relative z-10 flex items-center gap-5">
            {/* Avatar */}
            {p?.profile_image_url ? (
              <img src={p.profile_image_url} alt={displayName} className="h-20 w-20 rounded-2xl object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-2xl gradient-primary flex items-center justify-center text-2xl font-bold text-white">
                {initials || '?'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{displayName}</h1>
              <p className="text-sm text-muted-foreground">@{p?.username || user.email.split('@')[0]}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="glass-subtle border-white/10 text-xs">
                  <Trophy className="h-3 w-3 mr-1" /> Level {p?.level || 1}
                </Badge>
                {p?.is_admin && (
                  <Badge className="bg-primary/20 text-primary border border-primary/30 text-xs">
                    <Shield className="h-3 w-3 mr-1" /> Admin
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* XP Progress bar */}
          <div className="relative z-10 mt-5">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{p?.total_points || 0} XP</span>
              <span>Next level: {((p?.level || 1) * 100)} XP</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full gradient-primary rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(levelProgress, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </BlurFade>

      {/* Stats row */}
      <BlurFade delay={0.1}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { icon: Heart, label: 'Favorites', value: stats.favorites, color: 'text-red-400' },
            { icon: Star, label: 'Trust Score', value: p?.trust_score?.toFixed(0) || '50', color: 'text-yellow-400' },
            { icon: Calendar, label: 'Member Since', value: p ? new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—', color: 'text-blue-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="glass rounded-xl p-4 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1.5 ${color}`} />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </BlurFade>

      {/* Info section */}
      <BlurFade delay={0.2}>
        <div className="glass rounded-xl divide-y divide-white/5">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm">
                {p?.default_city && p?.default_state
                  ? `${p.default_city}, ${p.default_state}`
                  : location ? 'Using current location' : 'Not set'}
              </p>
            </div>
          </div>
          {p?.last_login_at && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Last Active</p>
                <p className="text-sm">{new Date(p.last_login_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </BlurFade>

      {/* Quick links */}
      <BlurFade delay={0.3}>
        <div className="glass rounded-xl mt-4 divide-y divide-white/5">
          {[
            { icon: Heart, label: 'My Favorites', to: '/favorites', color: 'text-red-400' },
            { icon: MessageSquare, label: 'My Reviews', to: '/search', color: 'text-blue-400' },
          ].map(({ icon: Icon, label, to, color }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="flex items-center gap-3 px-4 py-3.5 w-full hover:bg-white/[0.03] transition-colors"
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-sm flex-1 text-left">{label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </BlurFade>

      {/* Logout */}
      <BlurFade delay={0.4}>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full mt-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </BlurFade>
    </div>
  );
};

export default Profile;
