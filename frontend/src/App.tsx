import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LocationProvider } from './contexts/LocationContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Search from './pages/Search';
import BusinessDetail from './pages/BusinessDetail';
import Favorites from './pages/Favorites';
import Deals from './pages/Deals';
import AIAssistant from './pages/AIAssistant';
import Profile from './pages/Profile';

function App() {
  return (
    <Router>
      <AuthProvider>
        <LocationProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/search" element={<Search />} />
              <Route path="/business/:id" element={<BusinessDetail />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/deals" element={<Deals />} />
              <Route path="/ai" element={<AIAssistant />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={
                <div className="container mx-auto px-4 py-24 text-center">
                  <h1 className="text-6xl font-bold mb-4 gradient-text">404</h1>
                  <p className="text-muted-foreground">Page not found</p>
                </div>
              } />
            </Routes>
          </Layout>
        </LocationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
