import React, { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import BusinessCard from '../components/BusinessCard';
import '../styles/Search.css';

/** Search page with text search, category/price/open-now filters, and sort controls. */
const Search: React.FC = () => {
  const navigate = useNavigate();
  const { location } = useLocation();

  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [sortBy, setSortBy] = useState('distance');
  const [categories, setCategories] = useState<string[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    businessApi.getCategories().then((res) => setCategories(res.data.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchResults();
  }, [sortBy, category, priceRange]);

  const fetchResults = async () => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, any> = {
        sortBy,
        limit: 50,
      };
      if (searchQuery) params.query = searchQuery;
      if (category) params.category = category;
      if (priceRange) params.priceRange = priceRange;
      if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
        params.radius = 25;
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
    <div className="search-page">
      <h1>Search Businesses</h1>

      <form className="search-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Search by name, category, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search businesses"
        />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <div className="filters-row">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={priceRange}
          onChange={(e) => setPriceRange(e.target.value)}
          aria-label="Filter by price range"
        >
          <option value="">Any Price</option>
          <option value="$">$</option>
          <option value="$$">$$</option>
          <option value="$$$">$$$</option>
          <option value="$$$$">$$$$</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort results by"
        >
          <option value="distance">Distance</option>
          <option value="rating">Rating</option>
          <option value="review_count">Most Reviews</option>
        </select>
      </div>

      <div className="search-results">
        {loading ? (
          <div className="loading">Searching...</div>
        ) : businesses.length > 0 ? (
          <div className="business-grid">
            {businesses.map((b) => (
              <BusinessCard key={b.id} business={b} onClick={(id) => navigate(`/business/${id}`)} />
            ))}
          </div>
        ) : hasSearched ? (
          <div className="no-results">No businesses found. Try adjusting your filters.</div>
        ) : null}
      </div>
    </div>
  );
};

export default Search;
