import React from 'react';
import { Business } from '../services/api';

interface BusinessCardProps {
  business: Business;
  onClick: (id: number) => void;
}

const priceLevelDisplay = (level?: number) => {
  if (!level) return null;
  return '$'.repeat(level);
};

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
      <p className="category">
        {business.categories?.map(c => c.name).join(', ') || 'Uncategorized'}
      </p>
      {business.price_level && (
        <span className="price-range">{priceLevelDisplay(business.price_level)}</span>
      )}
      {business.description && <p className="description">{business.description}</p>}
      <div className="business-meta">
        <span className="rating">⭐ {Number(business.average_rating || 0).toFixed(1)}</span>
        <span className="reviews">({business.review_count || 0} reviews)</span>
        {business.distance_km != null && (
          <span className="distance">{Number(business.distance_km).toFixed(1)} km</span>
        )}
      </div>
    </div>
  );
};

export default BusinessCard;
