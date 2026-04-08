import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

interface LocationContextType {
  location: { latitude: number; longitude: number } | null;
  requestLocation: () => Promise<void>;
  setManualLocation: (lat: number, lng: number) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    const savedLocation = localStorage.getItem('userLocation');
    if (savedLocation) {
      setLocation(JSON.parse(savedLocation));
    }
  }, []);

  const requestLocation = async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setLocation(newLocation);
          localStorage.setItem('userLocation', JSON.stringify(newLocation));

          try {
            await axios.put('/api/auth/location', newLocation);
          } catch (error) {
            console.error('Failed to update location on server:', error);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  };

  const setManualLocation = (latitude: number, longitude: number) => {
    const newLocation = { latitude, longitude };
    setLocation(newLocation);
    localStorage.setItem('userLocation', JSON.stringify(newLocation));
  };

  return (
    <LocationContext.Provider value={{ location, requestLocation, setManualLocation }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
