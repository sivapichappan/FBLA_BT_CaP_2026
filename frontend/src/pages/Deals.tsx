import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { dealApi, Deal } from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
      <div className="flex items-center gap-3 mb-6">
        <Tag className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">Deals & Offers</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : deals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {deals.map(d => (
            <Card key={d.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{d.title}</CardTitle>
                  <Badge>
                    {d.discount_type === 'percent' ? `${d.discount_value}% off` : `$${d.discount_value} off`}
                  </Badge>
                </div>
                {d.business_name && (
                  <button
                    onClick={() => navigate(`/business/${d.business_id}`)}
                    className="text-sm text-primary hover:underline text-left flex items-center gap-1"
                  >
                    <MapPin className="h-3 w-3" /> {d.business_name}
                  </button>
                )}
              </CardHeader>
              <CardContent>
                {d.description && (
                  <p className="text-sm text-muted-foreground mb-3">{d.description}</p>
                )}
                <div className="flex items-center justify-between">
                  {d.end_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expires {new Date(d.end_date).toLocaleDateString()}
                    </span>
                  )}
                  {isAuthenticated && (
                    <Button size="sm" onClick={() => redeemDeal(d.id)}>Claim</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Tag className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No deals available</h2>
          <p className="text-muted-foreground">Check back later for new deals and offers.</p>
        </div>
      )}
    </div>
  );
};

export default Deals;
