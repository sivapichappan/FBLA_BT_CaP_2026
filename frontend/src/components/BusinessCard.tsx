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
      className={`h-3.5 w-3.5 inline-block ${i < level ? 'text-green-400' : 'text-white/10'}`}
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
          : 'text-white/10'
      }`}
    />
  ));
};

const BusinessCard: React.FC<BusinessCardProps> = ({ business, onClick }) => {

  return (
    <div
      className="cursor-pointer glass rounded-xl overflow-hidden group hover:bg-white/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {business.is_open_now !== null && business.is_open_now !== undefined && (
            <div className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${
              business.is_open_now
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {business.is_open_now ? 'Open' : 'Closed'}
            </div>
          )}
          {business.price_level && (
            <div className="absolute top-2.5 left-2.5 glass-subtle rounded-full px-2 py-0.5 flex">
              {priceLevelDisplay(business.price_level)}
            </div>
          )}
        </div>
      )}

      <div className={`p-4 ${business.photo_url ? 'pt-3' : ''}`}>
        {/* Name */}
        <h3 className="font-semibold text-base leading-tight mb-1.5 line-clamp-1 group-hover:text-primary transition-colors">
          {business.name}
        </h3>

        {/* Category + Local Badge */}
        <div className="flex flex-wrap gap-1 mb-2">
          {(business.primary_type_display_name || business.category_name) && (
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0 bg-white/5 border-white/10 text-muted-foreground">
              {business.primary_type_display_name || business.category_name}
            </Badge>
          )}
          {business.local_badge === 'verified_local' && (
            <Badge className="text-[11px] px-1.5 py-0 bg-green-500/15 hover:bg-green-500/20 text-green-400 border border-green-500/20">
              ✓ Verified Local
            </Badge>
          )}
          {business.local_badge === 'likely_local' && (
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-green-500/20 text-green-400/80">
              ~ Likely Local
            </Badge>
          )}
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
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-xs text-muted-foreground">
          {!business.photo_url && business.is_open_now !== null && business.is_open_now !== undefined ? (
            <span className={`flex items-center gap-1 font-medium ${
              business.is_open_now ? 'text-green-400' : 'text-red-400'
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
      </div>
    </div>
  );
};

export default BusinessCard;
