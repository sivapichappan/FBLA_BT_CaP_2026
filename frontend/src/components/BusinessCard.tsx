import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Clock, DollarSign } from 'lucide-react';
import { Business } from '../services/api';

interface BusinessCardProps {
  business: Business;
  onClick: (id: number | string) => void;
}

const priceLevelDisplay = (level?: number | null) => {
  if (!level) return null;
  return Array.from({ length: 4 }, (_, i) => (
    <DollarSign
      key={i}
      className={`h-3.5 w-3.5 inline-block ${i < level ? 'text-foreground' : 'text-muted-foreground/30'}`}
    />
  ));
};

const ratingStars = (rating: number) => {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`h-3.5 w-3.5 ${
        i < Math.round(rating)
          ? 'fill-yellow-400 text-yellow-400'
          : 'text-muted-foreground/30'
      }`}
    />
  ));
};

const formatTypes = (types?: string[]) => {
  if (!types || types.length === 0) return null;
  const exclude = ['point_of_interest', 'establishment', 'political', 'locality', 'sublocality'];
  const filtered = types
    .filter(t => !exclude.includes(t))
    .slice(0, 3)
    .map(t => t.replace(/_/g, ' '));
  return filtered;
};

const BusinessCard: React.FC<BusinessCardProps> = ({ business, onClick }) => {
  const types = formatTypes(business.types);

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden group"
      onClick={() => onClick(business.id)}
    >
      {/* Photo */}
      {business.photo_url && (
        <div className="relative h-40 overflow-hidden">
          <img
            src={business.photo_url}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          {business.is_open_now !== null && business.is_open_now !== undefined && (
            <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium ${
              business.is_open_now
                ? 'bg-green-500/90 text-white'
                : 'bg-red-500/90 text-white'
            }`}>
              {business.is_open_now ? 'Open' : 'Closed'}
            </div>
          )}
          {business.price_level && (
            <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-full px-2 py-0.5 flex">
              {priceLevelDisplay(business.price_level)}
            </div>
          )}
        </div>
      )}

      <CardContent className={business.photo_url ? 'pt-3' : 'pt-5'}>
        {/* Name */}
        <h3 className="font-semibold text-base leading-tight mb-1.5 line-clamp-1 group-hover:text-primary transition-colors">
          {business.name}
        </h3>

        {/* Categories / Types */}
        <div className="flex flex-wrap gap-1 mb-2">
          {business.categories && business.categories.length > 0 && business.categories[0].name !== 'Other' ? (
            business.categories.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] px-1.5 py-0">
                {c.name}
              </Badge>
            ))
          ) : types && types.length > 0 ? (
            types.map((t, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] px-1.5 py-0 capitalize">
                {t}
              </Badge>
            ))
          ) : null}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex">{ratingStars(business.average_rating || 0)}</div>
          <span className="text-sm font-medium">{Number(business.average_rating || 0).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">
            ({business.review_count || 0})
          </span>
        </div>

        {/* Address */}
        {business.address_line_1 && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground mb-1.5">
            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{business.address_line_1}</span>
          </div>
        )}

        {/* Bottom row: open status + distance */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
          {!business.photo_url && business.is_open_now !== null && business.is_open_now !== undefined ? (
            <span className={`flex items-center gap-1 font-medium ${
              business.is_open_now ? 'text-green-600' : 'text-red-500'
            }`}>
              <Clock className="h-3 w-3" />
              {business.is_open_now ? 'Open now' : 'Closed'}
            </span>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            {!business.photo_url && business.price_level && (
              <span className="flex">{priceLevelDisplay(business.price_level)}</span>
            )}
            {business.distance_km != null && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {Number(business.distance_km).toFixed(1)} km
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BusinessCard;
