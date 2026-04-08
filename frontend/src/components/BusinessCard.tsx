import React from 'react';
import { Business } from '../services/api';

interface BusinessCardProps {
  business: Business;
  onClick: (id: string) => void;
}

/** Reusable card displaying a business summary with rating, reviews, and distance. */
const BusinessCard: React.FC<BusinessCardProps> = ({ business, onClick }) => {
  return (
    <div
      className="business-card"
      onClick={() => onClick(business.id)}
      role="button"
      tabIndex={0}
      aria-label={`View ${business.name}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick(business.id)}
    >
      <h3>{business.name}</h3>
      <p className="category">{business.category}</p>
      {business.price_range && <span className="price-range">{business.price_range}</span>}
      <p className="description">{business.description}</p>
      <div className="business-meta">
        <span className="rating">⭐ {Number(business.avg_rating).toFixed(1)}</span>
        <span className="reviews">({business.review_count} reviews)</span>
        {business.distance_km && (
          <span className="distance">{Number(business.distance_km).toFixed(1)} km</span>
        )}
      </div>
    </div>
  );
};

export default BusinessCard;
