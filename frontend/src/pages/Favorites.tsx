import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { favoriteApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart } from 'lucide-react';

const Favorites = () => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Business[]>([]);
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Heart className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">My Favorites</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : favorites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map(b => (
            <BusinessCard key={b.id} business={b} onClick={id => navigate(`/business/${id}`)} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Heart className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
          <p className="text-muted-foreground">
            Browse businesses and click the heart to save your favorites.
          </p>
        </div>
      )}
    </div>
  );
};

export default Favorites;
