import React, { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface MapComponentProps {
  center: { lat: number; lng: number };
  businesses?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
  }>;
  onBusinessClick?: (businessId: number) => void;
  zoom?: number;
}

const MapComponent: React.FC<MapComponentProps> = ({
  center,
  businesses = [],
  onBusinessClick,
  zoom = 13,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
      version: 'weekly',
    });

    loader.load().then(() => {
      if (mapRef.current && !mapInstanceRef.current) {
        mapInstanceRef.current = new google.maps.Map(mapRef.current, {
          center,
          zoom,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        });
      }
    });
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(center);
    }
  }, [center]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    businesses.forEach(business => {
      const marker = new google.maps.Marker({
        position: { lat: business.latitude, lng: business.longitude },
        map: mapInstanceRef.current!,
        title: business.name,
        animation: google.maps.Animation.DROP,
      });

      if (onBusinessClick) {
        marker.addListener('click', () => onBusinessClick(business.id));
      }

      markersRef.current.push(marker);
    });
  }, [businesses, onBusinessClick]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />;
};

export default MapComponent;
