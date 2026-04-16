import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="border-t border-white/5 mt-auto bg-background-secondary">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-md gradient-primary flex items-center justify-center">
                <MapPin className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-lg">LocalDiscover</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Discover and support local businesses in your community.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Explore</h3>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/search" className="hover:text-foreground transition-colors">Search Businesses</Link>
              <Link to="/deals" className="hover:text-foreground transition-colors">Deals & Offers</Link>
              <Link to="/ai" className="hover:text-foreground transition-colors">AI Assistant</Link>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Account</h3>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/login" className="hover:text-foreground transition-colors">Login</Link>
              <Link to="/register" className="hover:text-foreground transition-colors">Sign Up</Link>
              <Link to="/favorites" className="hover:text-foreground transition-colors">Favorites</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/5 mt-8 pt-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} LocalDiscover. Built for FBLA Business Technology.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
