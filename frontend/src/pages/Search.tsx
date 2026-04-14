import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search as SearchIcon } from 'lucide-react';

const CATEGORIES = [
  { label: 'Food & Drink', type: 'restaurant', emoji: '🍽️' },
  { label: 'Coffee', type: 'cafe', emoji: '☕' },
  { label: 'Shopping', type: 'shopping_mall', emoji: '🛍️' },
  { label: 'Beauty', type: 'hair_salon', emoji: '💆' },
  { label: 'Health', type: 'hospital', emoji: '🏥' },
  { label: 'Entertainment', type: 'movie_theater', emoji: '🎭' },
  { label: 'Fitness', type: 'gym', emoji: '🏋️' },
  { label: 'Services', type: 'bank', emoji: '🔧' },
  { label: 'Nightlife', type: 'bar', emoji: '🍸' },
];

const RADIUS_PRESETS = [
  { label: 'Walking', value: 1000, desc: '1 km' },
  { label: 'Biking', value: 3000, desc: '3 km' },
  { label: 'Driving', value: 10000, desc: '10 km' },
];

const Search = () => {
  const navigate = useNavigate();
  const { location, requestLocation } = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [radius, setRadius] = useState(1000);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!location) requestLocation();
  }, []);

  useEffect(() => {
    if (location) fetchResults();
  }, [selectedType, radius, location]);

  const fetchResults = async () => {
    if (!location) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, any> = {
        latitude: location.latitude,
        longitude: location.longitude,
        radius,
      };
      if (searchQuery) params.query = searchQuery;
      if (selectedType) params.type = selectedType;
      const res = await businessApi.search(params);
      setBusinesses(res.data.businesses);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchResults();
  };

  const toggleCategory = (type: string) => {
    setSelectedType(prev => (prev === type ? null : type));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Businesses</h1>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <Input
          placeholder="Search for anything nearby..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" className="gap-2">
          <SearchIcon className="h-4 w-4" /> Search
        </Button>
      </form>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {CATEGORIES.map(cat => (
          <button
            key={cat.type}
            onClick={() => toggleCategory(cat.type)}
            className="flex-shrink-0"
          >
            <Badge
              variant={selectedType === cat.type ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              {cat.emoji} {cat.label}
            </Badge>
          </button>
        ))}
      </div>

      {/* Radius presets */}
      <div className="flex gap-2 mb-6">
        {RADIUS_PRESETS.map(preset => (
          <Button
            key={preset.value}
            variant={radius === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRadius(preset.value)}
          >
            {preset.label} ({preset.desc})
          </Button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : businesses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {businesses.map(b => (
            <BusinessCard key={b.id} business={b} onClick={id => navigate(`/business/${id}`)} />
          ))}
        </div>
      ) : hasSearched ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No businesses found nearby.</p>
          <p className="text-sm mt-1">Try a larger radius or different category.</p>
        </div>
      ) : !location ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Enable location to discover businesses near you.</p>
          <Button className="mt-4" onClick={requestLocation}>Enable Location</Button>
        </div>
      ) : null}
    </div>
  );
};

export default Search;
