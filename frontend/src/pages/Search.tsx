import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search as SearchIcon, MapPin, Navigation, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { label: 'Food & Drink', type: 'restaurant', emoji: '🍽️' },
  { label: 'Coffee', type: 'cafe', emoji: '☕' },
  { label: 'Shopping', type: 'clothing_store', emoji: '🛍️' },
  { label: 'Groceries', type: 'grocery_store', emoji: '🛒' },
  { label: 'Beauty & Spa', type: 'beauty_salon', emoji: '💆' },
  { label: 'Fitness', type: 'gym', emoji: '🏋️' },
  { label: 'Auto', type: 'car_repair', emoji: '🚗' },
  { label: 'Health', type: 'dentist', emoji: '🏥' },
  { label: 'Nightlife', type: 'bar', emoji: '🍸' },
];

const RADIUS_PRESETS = [
  { label: 'Walking', value: 1000, desc: '1 km' },
  { label: 'Biking', value: 3000, desc: '3 km' },
  { label: 'Driving', value: 10000, desc: '10 km' },
];

const Search = () => {
  const navigate = useNavigate();
  const { location, requestLocation, setManualLocation } = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [radius, setRadius] = useState(1000);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Location picker state
  const [locationInput, setLocationInput] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [locationError, setLocationError] = useState('');

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

  const handleLocationSearch = async () => {
    if (!locationInput.trim()) return;
    setGeocoding(true);
    setLocationError('');
    try {
      const res = await businessApi.geocode(locationInput.trim());
      setManualLocation(res.data.latitude, res.data.longitude);
      setLocationLabel(res.data.formatted_address);
      setLocationInput('');
    } catch {
      setLocationError('Location not found. Try a city name or address.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleUseMyLocation = () => {
    setLocationLabel('');
    setLocationError('');
    requestLocation();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Businesses</h1>

      {/* Location picker */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-shrink-0">
          <MapPin className="h-4 w-4" />
          <span className="font-medium">
            {locationLabel || (location ? 'Current location' : 'No location set')}
          </span>
        </div>
        <div className="flex gap-2 flex-1">
          <Input
            placeholder="Enter city or address..."
            value={locationInput}
            onChange={e => setLocationInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLocationSearch()}
            className="flex-1 h-9"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleLocationSearch}
            disabled={geocoding || !locationInput.trim()}
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleUseMyLocation} className="gap-1 flex-shrink-0">
            <Navigation className="h-3.5 w-3.5" /> My Location
          </Button>
        </div>
        {locationError && (
          <p className="text-xs text-destructive">{locationError}</p>
        )}
      </div>

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
          <p className="text-sm mt-1">Try a larger radius, different category, or change your location.</p>
        </div>
      ) : !location ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Set a location to discover businesses.</p>
          <Button className="mt-4" onClick={requestLocation}>Enable Location</Button>
        </div>
      ) : null}
    </div>
  );
};

export default Search;
