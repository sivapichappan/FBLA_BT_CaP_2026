import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { businessApi, reviewApi, dealApi, favoriteApi, Business, Review, Deal } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import MapComponent from '../components/MapComponent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Heart, HeartOff, MapPin, Phone, Globe, Clock, Tag } from 'lucide-react';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BusinessDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  const businessId = parseInt(id || '0', 10);

  useEffect(() => {
    if (!businessId) return;
    loadBusiness();
  }, [businessId]);

  const isGooglePlace = String(businessId).startsWith('gp_');

  const loadBusiness = async () => {
    setLoading(true);
    try {
      const bizRes = await businessApi.getById(businessId);
      const biz = bizRes.data.business;
      setBusiness(biz);

      // Google Places businesses come with reviews embedded; skip local API calls
      if (isGooglePlace) {
        setReviews(biz.reviews || []);
        setDeals([]);
      } else {
        const [revRes, dealRes] = await Promise.all([
          reviewApi.getBusinessReviews(businessId as number),
          dealApi.getBusinessDeals(businessId as number),
        ]);
        setReviews(revRes.data.reviews);
        setDeals(dealRes.data.deals);

        if (isAuthenticated) {
          try {
            const favRes = await favoriteApi.check(businessId as number);
            setIsFavorite(favRes.data.isFavorite);
          } catch {}
        }
      }
    } catch (error) {
      console.error('Failed to load business:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!isAuthenticated) return;
    try {
      if (isFavorite) {
        await favoriteApi.remove(businessId);
      } else {
        await favoriteApi.add(businessId);
      }
      setIsFavorite(!isFavorite);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const submitReview = async () => {
    setSubmitting(true);
    try {
      await reviewApi.create({ businessId, ...newReview });
      setReviewDialogOpen(false);
      setNewReview({ rating: 5, title: '', content: '' });
      const revRes = await reviewApi.getBusinessReviews(businessId);
      setReviews(revRes.data.reviews);
      const bizRes = await businessApi.getById(businessId);
      setBusiness(bizRes.data.business);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const redeemDeal = async (dealId: number) => {
    try {
      const res = await dealApi.redeem(dealId);
      alert(`Deal claimed! Code: ${res.data.claim.redemption_code}`);
      const dealRes = await dealApi.getBusinessDeals(businessId);
      setDeals(dealRes.data.deals);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to claim deal');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Business not found</h1>
        <p className="text-muted-foreground">This business may have been removed.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">{business.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {business.primary_type_display_name && (
              <Badge variant="secondary">{business.primary_type_display_name}</Badge>
            )}
            {!business.primary_type_display_name && business.categories?.map(c => (
              <Badge key={c.id} variant="secondary">{c.icon} {c.name}</Badge>
            ))}
            {business.price_level && (
              <Badge variant="outline">{'$'.repeat(business.price_level)}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              {Number(business.average_rating || 0).toFixed(1)} ({business.review_count} reviews)
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {business.city}, {business.state}
            </span>
          </div>
        </div>
        {isAuthenticated && (
          <Button variant={isFavorite ? 'default' : 'outline'} onClick={toggleFavorite} className="gap-2">
            {isFavorite ? <HeartOff className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
            {isFavorite ? 'Remove Favorite' : 'Add Favorite'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="about" className="space-y-6">
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="about">
          {business.editorial_summary && (
            <p className="text-muted-foreground italic mb-6 text-sm border-l-2 pl-4">
              {business.editorial_summary}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {business.description && !business.editorial_summary && <p>{business.description}</p>}
                <Separator />
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{business.address_line_1}{business.address_line_2 ? `, ${business.address_line_2}` : ''}, {business.city}, {business.state} {business.zip_code}</span>
                </div>
                {business.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${business.phone}`} className="hover:underline">{business.phone}</a>
                  </div>
                )}
                {business.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">{business.website}</a>
                  </div>
                )}
                {business.google_maps_uri && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <a href={business.google_maps_uri} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">View on Google Maps</a>
                  </div>
                )}
              </CardContent>
            </Card>

            {((business.weekday_descriptions && business.weekday_descriptions.length > 0) ||
              (business.hours && business.hours.length > 0)) && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Hours</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {business.weekday_descriptions && business.weekday_descriptions.length > 0 ? (
                      business.weekday_descriptions.map((text: string, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{text}</span>
                        </div>
                      ))
                    ) : (
                      business.hours?.map(h => (
                        <div key={h.day_of_week} className="flex justify-between">
                          <span className="font-medium">{dayNames[h.day_of_week]}</span>
                          <span className="text-muted-foreground">
                            {h.is_closed ? 'Closed' : `${h.open_time} - ${h.close_time}`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="reviews">
          <div className="space-y-4">
            {isAuthenticated && (
              <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Star className="h-4 w-4" /> Write a Review</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Write a Review</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Rating</Label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} type="button" onClick={() => setNewReview(r => ({ ...r, rating: n }))}>
                            <Star className={`h-6 w-6 ${n <= newReview.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Title (optional)</Label>
                      <Input value={newReview.title} onChange={e => setNewReview(r => ({ ...r, title: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Review</Label>
                      <Textarea value={newReview.content} onChange={e => setNewReview(r => ({ ...r, content: e.target.value }))} rows={4} />
                    </div>
                    <Button onClick={submitReview} disabled={submitting} className="w-full">
                      {submitting ? 'Submitting...' : 'Submit Review'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {reviews.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No reviews yet. Be the first!</p>
            ) : (
              reviews.map(r => (
                <Card key={r.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {r.user.firstName?.[0] || r.user.username[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{r.user.firstName} {r.user.lastName}</p>
                          <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                    </div>
                    {r.title && <p className="font-semibold text-sm mb-1">{r.title}</p>}
                    {r.content && <p className="text-sm text-muted-foreground">{r.content}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="deals">
          {deals.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No active deals right now.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deals.map(d => (
                <Card key={d.id}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" /> {d.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {d.description && <p className="text-sm text-muted-foreground mb-3">{d.description}</p>}
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">
                        {d.discount_type === 'percent' ? `${d.discount_value}% off` : `$${d.discount_value} off`}
                      </Badge>
                      {isAuthenticated && (
                        <Button size="sm" onClick={() => redeemDeal(d.id)}>Claim Deal</Button>
                      )}
                    </div>
                    {d.end_date && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Expires {new Date(d.end_date).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="map">
          <div className="rounded-lg overflow-hidden border h-[400px]">
            <MapComponent
              center={{ lat: business.latitude, lng: business.longitude }}
              businesses={[{ id: business.id, name: business.name, latitude: business.latitude, longitude: business.longitude }]}
              zoom={15}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BusinessDetail;
