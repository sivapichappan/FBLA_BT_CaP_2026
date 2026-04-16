import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { favoriteApi } from '../services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BlurFade from '@/components/ui/blur-fade';
import { Heart, Star, MapPin, Trash2 } from 'lucide-react';

interface FavoriteItem {
  id: number | string;
  name: string;
  address_line_1: string;
  average_rating: number;
  photo_url: string | null;
  primary_type_display_name: string | null;
  source: 'local' | 'google_places';
  favorited_at: string;
  collection_name: string;
}

const Favorites = () => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const res = await favoriteApi.getAll();
      setFavorites(res.data.favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (id: number | string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await favoriteApi.remove(id);
      setFavorites(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error('Failed to remove favorite:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <BlurFade delay={0}>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Heart className="h-4.5 w-4.5 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold">My Favorites</h1>
          {favorites.length > 0 && (
            <Badge variant="secondary" className="bg-white/5 border-white/10">{favorites.length}</Badge>
          )}
        </div>
      </BlurFade>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : favorites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map((fav, i) => (
            <BlurFade key={fav.id} delay={0.03 * i}>
              <div
                className="cursor-pointer glass rounded-xl overflow-hidden group hover:-translate-y-0.5 hover:bg-white/[0.04] transition-all"
                onClick={() => navigate(`/business/${fav.id}`)}
              >
                {fav.photo_url && (
                  <div className="relative h-36 overflow-hidden">
                    <img
                      src={fav.photo_url}
                      alt={fav.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  </div>
                )}
                <div className={`p-4 ${fav.photo_url ? 'pt-3' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base leading-tight mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                        {fav.name}
                      </h3>
                      {fav.primary_type_display_name && (
                        <Badge variant="secondary" className="text-[11px] px-1.5 py-0 mb-2 bg-white/5 border-white/10 text-muted-foreground">
                          {fav.primary_type_display_name}
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 text-sm mb-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        <span>{Number(fav.average_rating || 0).toFixed(1)}</span>
                      </div>
                      {fav.address_line_1 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {fav.address_line_1}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      onClick={(e) => removeFavorite(fav.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      ) : (
        <BlurFade delay={0.1}>
          <div className="text-center py-20 glass rounded-xl">
            <Heart className="h-14 w-14 mx-auto text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Browse businesses and click the heart to save your favorites.
            </p>
            <Button onClick={() => navigate('/search')} className="gradient-primary border-0">Explore Businesses</Button>
          </div>
        </BlurFade>
      )}
    </div>
  );
};

export default Favorites;
