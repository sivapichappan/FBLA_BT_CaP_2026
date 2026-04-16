import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { dealApi, Deal } from '../services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BlurFade from '@/components/ui/blur-fade';
import { Tag, Clock, MapPin } from 'lucide-react';

const Deals = () => {
  const navigate = useNavigate();
  const { location } = useLocation();
  const { isAuthenticated } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeals();
  }, [location]);

  const loadDeals = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.radius = 25;
      }
      const res = await dealApi.getAllActive(params);
      setDeals(res.data.deals);
    } catch (error) {
      console.error('Failed to load deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const redeemDeal = async (dealId: number) => {
    try {
      const res = await dealApi.redeem(dealId);
      alert(`Deal claimed! Your code: ${res.data.claim.redemption_code}`);
      loadDeals();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to claim deal');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <BlurFade delay={0}>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Tag className="h-4.5 w-4.5 text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold">Deals & Offers</h1>
        </div>
      </BlurFade>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : deals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals.map((d, i) => (
            <BlurFade key={d.id} delay={0.03 * i}>
              <div className="glass rounded-xl overflow-hidden hover:bg-white/[0.04] transition-all group">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-base">{d.title}</h3>
                    <Badge className="gradient-primary border-0 text-white flex-shrink-0">
                      {d.discount_type === 'percent' ? `${d.discount_value}% off` : `$${d.discount_value} off`}
                    </Badge>
                  </div>
                  {d.business_name && (
                    <button
                      onClick={() => navigate(`/business/${d.business_id}`)}
                      className="text-sm text-primary hover:underline text-left flex items-center gap-1 mb-3"
                    >
                      <MapPin className="h-3 w-3" /> {d.business_name}
                    </button>
                  )}
                  {d.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{d.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-white/5">
                    {d.end_date && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expires {new Date(d.end_date).toLocaleDateString()}
                      </span>
                    )}
                    {isAuthenticated && (
                      <Button size="sm" onClick={() => redeemDeal(d.id)} className="gradient-primary border-0 hover:opacity-90">Claim</Button>
                    )}
                  </div>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      ) : (
        <BlurFade delay={0.1}>
          <div className="text-center py-20 glass rounded-xl">
            <Tag className="h-14 w-14 mx-auto text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No deals available</h2>
            <p className="text-muted-foreground text-sm">Check back later for new deals and offers.</p>
          </div>
        </BlurFade>
      )}
    </div>
  );
};

export default Deals;
