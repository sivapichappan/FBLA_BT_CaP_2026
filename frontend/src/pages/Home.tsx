import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '../contexts/LocationContext';
import { businessApi, Business } from '../services/api';
import MapComponent from '../components/MapComponent';
import BusinessCard from '../components/BusinessCard';
import '../styles/Home.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { location, requestLocation } = useLocation();
  const [nearbyBusinesses, setNearbyBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location) {
      requestLocation();
    }
  }, []);

  useEffect(() => {
    if (location) {
      fetchNearbyBusinesses();
    }
  }, [location]);

  const fetchNearbyBusinesses = async () => {
    if (!location) return;

    setLoading(true);
    try {
      const response = await businessApi.search({
        latitude: location.latitude,
        longitude: location.longitude,
        radius: 10,
        limit: 10,
      });
      setNearbyBusinesses(response.data.businesses);
    } catch (error) {
      console.error('Failed to fetch nearby businesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBusinessClick = (businessId: string) => {
    navigate(`/business/${businessId}`);
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-content">
          <h1>Discover Local Businesses Near You</h1>
          <p>Find the best restaurants, shops, and services in your area</p>
          <div className="hero-actions">
            <button onClick={() => navigate('/search')} className="btn btn-primary btn-large">
              Start Exploring
            </button>
            {!location && (
              <button onClick={requestLocation} className="btn btn-secondary btn-large">
                Enable Location
              </button>
            )}
          </div>
        </div>
      </section>

      {location && (
        <section className="nearby-section">
          <h2>Businesses Near You</h2>

          <div className="map-container">
            <MapComponent
              center={{ lat: location.latitude, lng: location.longitude }}
              businesses={nearbyBusinesses.map(b => ({
                id: b.id,
                name: b.name,
                latitude: b.latitude,
                longitude: b.longitude,
              }))}
              onBusinessClick={handleBusinessClick}
            />
          </div>

          {loading ? (
            <div className="loading">Loading nearby businesses...</div>
          ) : (
            <div className="business-grid">
              {nearbyBusinesses.map(business => (
                <BusinessCard key={business.id} business={business} onClick={handleBusinessClick} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="features">
        <h2>Why Choose LocalDiscover?</h2>
        <div className="features-grid">
          <div className="feature">
            <h3>🗺️ Location-Based</h3>
            <p>Find businesses near you with real-time location tracking</p>
          </div>
          <div className="feature">
            <h3>⭐ Verified Reviews</h3>
            <p>Read authentic reviews from real customers</p>
          </div>
          <div className="feature">
            <h3>💰 Special Deals</h3>
            <p>Discover exclusive coupons and promotions</p>
          </div>
          <div className="feature">
            <h3>🤖 AI Assistant</h3>
            <p>Get personalized recommendations with our AI chatbot</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
