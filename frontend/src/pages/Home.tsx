import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import MapComponent from '../components/MapComponent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Search, Star, Tag, MessageCircle } from 'lucide-react';

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
        radius: 10000,
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
      <section className="bg-gradient-to-br from-primary/5 via-background to-primary/10 py-20 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Discover Local Businesses Near You
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Find the best restaurants, shops, and services in your area. Support local, discover more.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => navigate('/search')} className="gap-2">
              <Search className="h-5 w-5" /> Start Exploring
            </Button>
            {!location && (
              <Button size="lg" variant="outline" onClick={requestLocation} className="gap-2">
                <MapPin className="h-5 w-5" /> Enable Location
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Nearby businesses */}
      {location && (
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold mb-6">Businesses Near You</h2>

          <div className="rounded-lg overflow-hidden border mb-8 h-[400px]">
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
                <Skeleton key={i} className="h-48 rounded-lg" />
              ))}
            </div>
          ) : nearbyBusinesses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyBusinesses.map(b => (
                <BusinessCard key={b.id} business={b} onClick={(id) => navigate(`/business/${id}`)} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No businesses found nearby. Try expanding your search radius.
            </p>
          )}
        </section>
      )}

      {/* Features */}
      <section className="bg-muted/50 py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">Why Choose LocalDiscover?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: MapPin, title: 'Location-Based', desc: 'Find businesses near you with real-time location' },
              { icon: Star, title: 'Verified Reviews', desc: 'Read authentic reviews from real customers' },
              { icon: Tag, title: 'Special Deals', desc: 'Discover exclusive coupons and promotions' },
              { icon: MessageCircle, title: 'AI Assistant', desc: 'Get personalized recommendations with AI' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-background rounded-lg p-6 border text-center">
                <Icon className="h-10 w-10 mx-auto mb-3 text-primary" />
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
