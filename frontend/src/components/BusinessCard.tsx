import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin } from 'lucide-react';
import { Business } from '../services/api';

interface BusinessCardProps {
  business: Business;
  onClick: (id: number | string) => void;
}

const BusinessCard: React.FC<BusinessCardProps> = ({ business, onClick }) => {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => onClick(business.id)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg leading-tight">{business.name}</CardTitle>
        <div className="flex flex-wrap gap-1 mt-1">
          {business.categories?.map(c => (
            <Badge key={c.id} variant="secondary" className="text-xs">
              {c.icon} {c.name}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {business.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {business.description}
          </p>
        )}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              {Number(business.average_rating || 0).toFixed(1)}
            </span>
            <span className="text-muted-foreground">
              ({business.review_count || 0} reviews)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {business.price_level && (
              <span className="text-muted-foreground font-medium">
                {'$'.repeat(business.price_level)}
              </span>
            )}
            {business.distance_km != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
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
