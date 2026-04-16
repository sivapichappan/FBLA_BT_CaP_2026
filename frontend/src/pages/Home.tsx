import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import MapComponent from '../components/MapComponent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Search, Star, Tag, MessageCircle, ArrowRight } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const { location, requestLocation } = useLocation();
  const [nearbyBusinesses, setNearbyBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location) requestLocation();
  }, []);

  useEffect(() => {
    if (location) fetchNearbyBusinesses();
  }, [location]);

  const fetchNearbyBusinesses = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const response = await businessApi.search({
        latitude: location.latitude,
        longitude: location.longitude,
        radius: 1000,
      });
      setNearbyBusinesses(response.data.businesses);
    } catch (error) {
      console.error('Failed to fetch nearby businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-4">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl animate-glow-pulse" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/10 blur-3xl animate-glow-pulse" style={{ animationDelay: '1.5s' }} />
        </div>

        <div className="container mx-auto text-center max-w-3xl relative z-10">
          <div className="inline-flex items-center gap-2 glass-subtle rounded-full px-4 py-1.5 mb-6 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Discovering local businesses near you
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
            Discover{' '}
            <span className="gradient-text">Local Businesses</span>
            {' '}Near You
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Find the best restaurants, shops, and services in your area. Support local, discover more.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => navigate('/search')} className="gradient-primary border-0 hover:opacity-90 transition-opacity gap-2 glow-primary">
              <Search className="h-5 w-5" /> Start Exploring
              <ArrowRight className="h-4 w-4" />
            </Button>
            {!location && (
              <Button size="lg" variant="outline" onClick={requestLocation} className="gap-2 glass-subtle border-white/10 hover:bg-white/5">
                <MapPin className="h-5 w-5" /> Enable Location
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Nearby businesses */}
      {location && (
        <section className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Businesses Near You</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/search')} className="text-muted-foreground hover:text-foreground gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="rounded-xl overflow-hidden border border-white/5 mb-8 h-[400px] glass-shadow">
            <MapComponent
              center={{ lat: location.latitude, lng: location.longitude }}
              businesses={nearbyBusinesses.map(b => ({
                id: b.id, name: b.name, latitude: b.latitude, longitude: b.longitude,
              }))}
              onBusinessClick={(id) => navigate(`/business/${id}`)}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
              ))}
            </div>
          ) : nearbyBusinesses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyBusinesses.map(b => (
                <BusinessCard key={b.id} business={b} onClick={(id) => navigate(`/business/${id}`)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 glass rounded-xl">
              <p className="text-muted-foreground">No businesses found nearby. Try expanding your search radius.</p>
            </div>
          )}
        </section>
      )}

      {/* Features */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-2xl font-bold text-center mb-3">Why Choose LocalDiscover?</h2>
          <p className="text-center text-muted-foreground mb-10 max-w-lg mx-auto">
            Powered by advanced algorithms to connect you with the best independent businesses.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: MapPin, title: 'Location-Based', desc: 'Find businesses near you with real-time location', color: 'text-blue-400' },
              { icon: Star, title: 'Verified Reviews', desc: 'Read authentic reviews from real customers', color: 'text-yellow-400' },
              { icon: Tag, title: 'Special Deals', desc: 'Discover exclusive coupons and promotions', color: 'text-green-400' },
              { icon: MessageCircle, title: 'AI Assistant', desc: 'Get personalized recommendations with AI', color: 'text-purple-400' },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="glass rounded-xl p-6 text-center hover:bg-white/[0.03] transition-colors group">
                <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Icon className={`h-6 w-6 ${color}`} />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
