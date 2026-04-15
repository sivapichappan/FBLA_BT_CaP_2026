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
import {
  Star, Heart, HeartOff, MapPin, Phone, Globe, Clock, Tag,
  Navigation, Share2, DollarSign, ExternalLink,
} from 'lucide-react';

const BusinessDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heroPhoto, setHeroPhoto] = useState(0);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  const rawId = id || '';
  const isGooglePlace = rawId.startsWith('gp_');

  useEffect(() => {
    if (!rawId) return;
    loadBusiness();
    setHeroPhoto(0);
  }, [rawId]);

  const loadBusiness = async () => {
    setLoading(true);
    try {
      const bizRes = await businessApi.getById(rawId);
      const biz = bizRes.data.business;
      setBusiness(biz);

      if (isAuthenticated) {
        try {
          const favRes = await favoriteApi.check(rawId);
          setIsFavorite(favRes.data.isFavorite);
        } catch {}
      }

      if (isGooglePlace) {
        setReviews(biz.reviews || []);
        setDeals([]);
      } else {
        const numId = parseInt(rawId, 10);
        const [revRes, dealRes] = await Promise.all([
          reviewApi.getBusinessReviews(numId),
          dealApi.getBusinessDeals(numId),
        ]);
        setReviews(revRes.data.reviews);
        setDeals(dealRes.data.deals);
      }
    } catch (error) {
      console.error('Failed to load business:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!isAuthenticated || !business) return;
    try {
      if (isFavorite) {
        await favoriteApi.remove(rawId);
      } else {
        if (isGooglePlace) {
          await favoriteApi.add({
            googlePlaceId: rawId.slice(3),
            placeName: business.name,
            placeAddress: business.address_line_1,
            placeRating: business.average_rating,
            placePhotoUrl: business.photo_url || undefined,
            placeType: business.primary_type_display_name || business.category_name || undefined,
          });
        } else {
          await favoriteApi.add({ businessId: parseInt(rawId, 10) });
        }
      }
      setIsFavorite(!isFavorite);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const submitReview = async () => {
    if (isGooglePlace) return;
    setSubmitting(true);
    try {
      const numId = parseInt(rawId, 10);
      await reviewApi.create({ businessId: numId, ...newReview });
      setReviewDialogOpen(false);
      setNewReview({ rating: 5, title: '', content: '' });
      const revRes = await reviewApi.getBusinessReviews(numId);
      setReviews(revRes.data.reviews);
      const bizRes = await businessApi.getById(rawId);
      setBusiness(bizRes.data.business);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-64 md:h-80 w-full rounded-lg" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
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

  const photos = business.photos || [];
  const hasPhotos = photos.length > 0;
  const statusBadge = () => {
    if (business.business_status === 'CLOSED_PERMANENTLY') {
      return <Badge variant="destructive">Permanently Closed</Badge>;
    }
    if (business.business_status === 'CLOSED_TEMPORARILY') {
      return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Temporarily Closed</Badge>;
    }
    if (business.is_open_now === true) {
      return <Badge className="bg-green-500 text-white hover:bg-green-600">Open Now</Badge>;
    }
    if (business.is_open_now === false) {
      return <Badge variant="destructive">Closed</Badge>;
    }
    return null;
  };

  // --- Shared sections ---

  const photoGallery = hasPhotos && (
    <div className="mb-6">
      <div className="relative rounded-lg overflow-hidden h-64 md:h-80 mb-2">
        <img
          src={photos[heroPhoto]?.url}
          alt={business.name}
          className="w-full h-full object-cover"
        />
        {statusBadge() && (
          <div className="absolute top-3 right-3">{statusBadge()}</div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p: any, i: number) => (
            <button
              key={i}
              onClick={() => setHeroPhoto(i)}
              className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                i === heroPhoto ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <img src={p.url} alt="" className="h-16 w-24 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const headerSection = (
    <div className="mb-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold">{business.name}</h1>
            {!hasPhotos && statusBadge()}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {business.primary_type_display_name && (
              <Badge variant="secondary">{business.primary_type_display_name}</Badge>
            )}
            {!business.primary_type_display_name && business.categories?.map(c => (
              <Badge key={c.id} variant="secondary">{c.icon} {c.name}</Badge>
            ))}
            {business.price_level != null && business.price_level > 0 && (
              <Badge variant="outline" className="gap-0.5">
                {Array.from({ length: business.price_level }).map((_, i) => (
                  <DollarSign key={i} className="h-3 w-3" />
                ))}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < Math.round(business.average_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <span className="font-medium ml-1">{Number(business.average_rating || 0).toFixed(1)}</span>
              <span>({business.review_count} reviews)</span>
            </span>
            {(business.city || business.address_line_1) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {business.city && business.state ? `${business.city}, ${business.state}` : business.address_line_1}
              </span>
            )}
          </div>
        </div>
        {isAuthenticated && (
          <Button variant={isFavorite ? 'default' : 'outline'} onClick={toggleFavorite} className="gap-2 flex-shrink-0">
            {isFavorite ? <HeartOff className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
            {isFavorite ? 'Saved' : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );

  const ctaButtons = (
    <div className="flex flex-wrap gap-2 mb-6">
      {business.google_maps_uri && (
        <Button variant="outline" className="gap-2" asChild>
          <a href={business.google_maps_uri} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-4 w-4" /> Directions
          </a>
        </Button>
      )}
      {business.phone && (
        <Button variant="outline" className="gap-2" asChild>
          <a href={`tel:${business.phone}`}>
            <Phone className="h-4 w-4" /> Call
          </a>
        </Button>
      )}
      {business.website && (
        <Button variant="outline" className="gap-2" asChild>
          <a href={business.website} target="_blank" rel="noopener noreferrer">
            <Globe className="h-4 w-4" /> Website
          </a>
        </Button>
      )}
      <Button variant="outline" className="gap-2" onClick={handleShare}>
        <Share2 className="h-4 w-4" /> Share
      </Button>
    </div>
  );

  const editorialSection = business.editorial_summary && (
    <p className="text-muted-foreground italic text-sm border-l-2 border-primary/30 pl-4 mb-6">
      {business.editorial_summary}
    </p>
  );

  const detailsCard = (
    <Card>
      <CardHeader><CardTitle>Details</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {business.address_line_1 && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span>
              {business.address_line_1}
              {business.city && `, ${business.city}`}
              {business.state && `, ${business.state}`}
              {business.zip_code && ` ${business.zip_code}`}
            </span>
          </div>
        )}
        {business.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${business.phone}`} className="hover:underline">{business.phone}</a>
          </div>
        )}
        {business.website && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary truncate max-w-xs">
              {business.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        {business.google_maps_uri && (
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-muted-foreground" />
            <a href={business.google_maps_uri} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
              View on Google Maps
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const hoursCard = (business.weekday_descriptions && business.weekday_descriptions.length > 0) && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Hours
          {business.is_open_now !== null && business.is_open_now !== undefined && (
            <span className={`text-xs font-normal ml-2 ${business.is_open_now ? 'text-green-600' : 'text-red-500'}`}>
              {business.is_open_now ? '• Open now' : '• Closed'}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 text-sm">
          {business.weekday_descriptions.map((text: string, i: number) => {
            const parts = text.split(': ');
            return (
              <div key={i} className="flex justify-between">
                <span className="font-medium">{parts[0]}</span>
                <span className="text-muted-foreground">{parts.slice(1).join(': ')}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  const mapSection = (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Location</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-lg overflow-hidden border h-[300px]">
          <MapComponent
            center={{ lat: business.latitude, lng: business.longitude }}
            businesses={[{ id: business.id, name: business.name, latitude: business.latitude, longitude: business.longitude }]}
            zoom={15}
          />
        </div>
      </CardContent>
    </Card>
  );

  const reviewsSection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Reviews ({reviews.length})</h2>
        {isAuthenticated && !isGooglePlace && (
          <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Star className="h-4 w-4" /> Write a Review</Button>
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
      </div>

      {reviews.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">No reviews yet.</p>
      ) : (
        reviews.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {r.user?.profileImageUrl ? (
                    <img
                      src={r.user.profileImageUrl}
                      alt={r.user.firstName || r.user.username}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {(r.user?.firstName || r.user?.username || '?')[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {r.user?.firstName}{r.user?.lastName ? ` ${r.user.lastName}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} />
                  ))}
                </div>
              </div>
              {r.title && <p className="font-semibold text-sm mb-1">{r.title}</p>}
              {r.content && <p className="text-sm text-muted-foreground leading-relaxed">{r.content}</p>}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  // --- Google Places: single scroll layout ---
  if (isGooglePlace) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {photoGallery}
        {headerSection}
        {ctaButtons}
        {editorialSection}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {detailsCard}
          {hoursCard}
        </div>

        {mapSection}

        <Separator className="my-8" />

        {reviewsSection}
      </div>
    );
  }

  // --- Local DB business: tabbed layout ---
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {photoGallery}
      {headerSection}
      {ctaButtons}
      {editorialSection}

      <Tabs defaultValue="about" className="space-y-6">
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals.length})</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="about">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {detailsCard}
            {hoursCard}
          </div>
        </TabsContent>

        <TabsContent value="reviews">{reviewsSection}</TabsContent>

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
                        <Button size="sm" onClick={() => dealApi.redeem(d.id)}>Claim Deal</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="map">{mapSection}</TabsContent>
      </Tabs>
    </div>
  );
};

export default BusinessDetail;
