import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, MapPin, Trophy, Star, Calendar } from 'lucide-react';

const Profile = () => {
  const { user } = useAuth();
  const { location } = useLocation();

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">My Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {(user as any).first_name?.[0] || user.firstName?.[0] || user.email[0].toUpperCase()}
            </div>
            <div>
              <CardTitle className="text-xl">
                {(user as any).first_name || user.firstName} {(user as any).last_name || user.lastName}
              </CardTitle>
              <p className="text-sm text-muted-foreground">@{(user as any).username || user.email.split('@')[0]}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {location && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{(user as any).default_city || 'Location set'}, {(user as any).default_state || ''}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <span>Level {(user as any).level || 1}</span>
              <Badge variant="secondary">{(user as any).total_points || 0} pts</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Star className="h-4 w-4 text-muted-foreground" />
              <span>Trust Score: {(user as any).trust_score || 50}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Joined {new Date((user as any).created_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>

          {user.isAdmin && (
            <>
              <Separator />
              <Badge>Admin</Badge>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
