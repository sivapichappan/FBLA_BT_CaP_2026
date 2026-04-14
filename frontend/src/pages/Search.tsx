import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search as SearchIcon } from 'lucide-react';

const Search = () => {
  const navigate = useNavigate();
  const { location, requestLocation } = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!location) requestLocation();
  }, []);

  useEffect(() => {
    fetchResults();
  }, [categoryId, location]);

  const fetchResults = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, any> = {};
      if (searchQuery) params.query = searchQuery;
      if (categoryId && categoryId !== 'all') params.type = categoryId;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.radius = 5000;
      }
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

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Search Businesses</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input
          placeholder="Search by name or description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" className="gap-2">
          <SearchIcon className="h-4 w-4" /> Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-3 mb-8">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="restaurant">Restaurants</SelectItem>
            <SelectItem value="cafe">Cafes & Coffee</SelectItem>
            <SelectItem value="bar">Bars</SelectItem>
            <SelectItem value="store">Shopping</SelectItem>
            <SelectItem value="gym">Fitness</SelectItem>
            <SelectItem value="beauty_salon">Beauty & Spa</SelectItem>
            <SelectItem value="car_repair">Automotive</SelectItem>
            <SelectItem value="hospital">Healthcare</SelectItem>
          </SelectContent>
        </Select>

      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
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
          <p className="text-lg">No businesses found.</p>
          <p className="text-sm mt-1">Try adjusting your filters or search terms.</p>
        </div>
      ) : null}
    </div>
  );
};

export default Search;
