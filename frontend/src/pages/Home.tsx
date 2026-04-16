import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import MapComponent from '../components/MapComponent';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import AnimatedGradientText from '@/components/ui/animated-gradient-text';
import ShimmerButton from '@/components/ui/shimmer-button';
import NumberTicker from '@/components/ui/number-ticker';
import Particles from '@/components/ui/particles';
import BlurFade from '@/components/ui/blur-fade';
import { MapPin, Search, Tag, MessageCircle, ArrowRight, Shield, Sparkles } from 'lucide-react';

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
      <section className="relative overflow-hidden py-28 px-4">
        {/* Particles background */}
        <Particles quantity={50} color="rgba(59, 130, 246, 0.4)" size={1.5} />

        {/* Gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[100px] animate-glow-pulse" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-accent/8 blur-[100px] animate-glow-pulse" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-primary/5 blur-[80px]" />
        </div>

        <div className="container mx-auto text-center max-w-3xl relative z-10">
          <BlurFade delay={0}>
            <div className="inline-flex items-center gap-2 glass-subtle rounded-full px-4 py-1.5 mb-6 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered local business discovery
            </div>
          </BlurFade>

          <BlurFade delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-5 leading-[1.1]">
              Discover{' '}
              <AnimatedGradientText className="text-5xl md:text-7xl font-bold tracking-tight">
                Local Businesses
              </AnimatedGradientText>
              <br />Near You
            </h1>
          </BlurFade>

          <BlurFade delay={0.2}>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
              Find the best independent restaurants, shops, and services in your area.
              Support local businesses, discover hidden gems.
            </p>
          </BlurFade>

          <BlurFade delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <ShimmerButton onClick={() => navigate('/search')}>
                <Search className="h-5 w-5" /> Start Exploring
                <ArrowRight className="h-4 w-4" />
              </ShimmerButton>
              {!location && (
                <Button size="lg" variant="outline" onClick={requestLocation} className="gap-2 glass-subtle border-white/10 hover:bg-white/5 rounded-xl">
                  <MapPin className="h-5 w-5" /> Enable Location
                </Button>
              )}
            </div>
          </BlurFade>

          {/* Stats */}
          <BlurFade delay={0.5}>
            <div className="flex justify-center gap-8 mt-14">
              {[
                { value: 10000, suffix: '+', label: 'Local Businesses' },
                { value: 500, suffix: '+', label: 'Cities Covered' },
                { value: 50000, suffix: '+', label: 'Happy Users' },
              ].map((stat, i) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold">
                    <NumberTicker value={stat.value} suffix={stat.suffix} delay={0.6 + i * 0.15} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      {/* Nearby businesses */}
      {location && (
        <section className="container mx-auto px-4 py-12">
          <BlurFade delay={0.1}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Businesses Near You</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/search')} className="text-muted-foreground hover:text-foreground gap-1">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </BlurFade>

          <BlurFade delay={0.2}>
            <div className="rounded-xl overflow-hidden border border-white/5 mb-8 h-[400px] glass-shadow">
              <MapComponent
                center={{ lat: location.latitude, lng: location.longitude }}
                businesses={nearbyBusinesses.map(b => ({
                  id: b.id, name: b.name, latitude: b.latitude, longitude: b.longitude,
                }))}
                onBusinessClick={(id) => navigate(`/business/${id}`)}
              />
            </div>
          </BlurFade>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
              ))}
            </div>
          ) : nearbyBusinesses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyBusinesses.map((b, i) => (
                <BlurFade key={b.id} delay={0.05 * i}>
                  <BusinessCard business={b} onClick={(id) => navigate(`/business/${id}`)} />
                </BlurFade>
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
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </div>

        <div className="container mx-auto">
          <BlurFade delay={0.1}>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-3">Why Choose LocalDiscover?</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Powered by advanced algorithms to connect you with the best independent businesses.
              </p>
            </div>
          </BlurFade>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: MapPin, title: 'Location-Based', desc: 'Find businesses near you with real-time location detection', color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { icon: Shield, title: 'Local Verified', desc: 'Advanced chain detection ensures only independent businesses', color: 'text-green-400', bg: 'bg-green-500/10' },
              { icon: Tag, title: 'Special Deals', desc: 'Discover exclusive coupons and promotions from locals', color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { icon: MessageCircle, title: 'AI Assistant', desc: 'Two-stage AI pipeline for personalized recommendations', color: 'text-purple-400', bg: 'bg-purple-500/10' },
            ].map(({ icon: Icon, title, desc, color, bg }, i) => (
              <BlurFade key={title} delay={0.15 + i * 0.1}>
                <div className="glass rounded-xl p-6 hover:bg-white/[0.04] transition-all group h-full">
                  <div className={`h-12 w-12 rounded-xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <BlurFade delay={0.1}>
          <div className="container mx-auto max-w-2xl text-center">
            <div className="glass rounded-2xl p-10 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-accent/10 blur-3xl" />
              </div>
              <div className="relative z-10">
                <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to explore?</h2>
                <p className="text-muted-foreground mb-6">
                  Ask our AI assistant to find the perfect local business for you.
                </p>
                <ShimmerButton onClick={() => navigate('/ai')}>
                  <MessageCircle className="h-5 w-5" /> Chat with AI
                </ShimmerButton>
              </div>
            </div>
          </div>
        </BlurFade>
      </section>
    </div>
  );
};

export default Home;
