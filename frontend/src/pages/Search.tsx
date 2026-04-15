import { useEffect, useState, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search as SearchIcon, MapPin, Navigation } from 'lucide-react';

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

interface Prediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

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
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!location) requestLocation();
  }, []);

  useEffect(() => {
    if (location) fetchResults();
  }, [selectedType, radius, location]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPredictions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  // Autocomplete with 300ms debounce
  const handleLocationInputChange = (value: string) => {
    setLocationInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await businessApi.autocomplete(value);
        setPredictions(res.data.predictions);
        setShowPredictions(res.data.predictions.length > 0);
      } catch {
        setPredictions([]);
      }
    }, 300);
  };

  const selectPrediction = async (prediction: Prediction) => {
    setShowPredictions(false);
    setPredictions([]);
    setLocationInput('');
    setGeocoding(true);
    try {
      const res = await businessApi.geocode(prediction.description);
      setManualLocation(res.data.latitude, res.data.longitude);
      setLocationLabel(prediction.description);
    } catch {
      setLocationLabel(prediction.main_text);
    } finally {
      setGeocoding(false);
    }
  };

  const handleLocationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (predictions.length > 0) {
        selectPrediction(predictions[0]);
      }
    }
  };

  const handleUseMyLocation = () => {
    setLocationLabel('');
    setPredictions([]);
    setShowPredictions(false);
    requestLocation();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Businesses</h1>

      {/* Location picker */}
      <div className="p-3 bg-muted/50 rounded-lg border mb-4">
        <div className="flex items-center gap-2 text-sm mb-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">
            {geocoding ? 'Finding location...' : locationLabel || (location ? 'Current location' : 'No location set')}
          </span>
        </div>
        <div className="flex gap-2 relative" ref={dropdownRef}>
          <div className="relative flex-1">
            <Input
              placeholder="Enter city, zip code, or address..."
              value={locationInput}
              onChange={e => handleLocationInputChange(e.target.value)}
              onFocus={() => predictions.length > 0 && setShowPredictions(true)}
              onKeyDown={handleLocationKeyDown}
              className="h-9"
            />
            {/* Autocomplete dropdown */}
            {showPredictions && predictions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
                {predictions.map(p => (
                  <button
                    key={p.place_id}
                    onClick={() => selectPrediction(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-start gap-2 border-b last:border-b-0"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{p.main_text}</p>
                      <p className="text-xs text-muted-foreground">{p.secondary_text}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" onClick={handleUseMyLocation} className="gap-1 flex-shrink-0 h-9">
            <Navigation className="h-3.5 w-3.5" /> My Location
          </Button>
        </div>
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
