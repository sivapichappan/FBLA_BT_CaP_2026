import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Header.css';

const Header: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <h1>LocalDiscover</h1>
        </Link>

        <nav className="nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/search" className="nav-link">Search</Link>
          {isAuthenticated && (
            <>
              <Link to="/favorites" className="nav-link">Favorites</Link>
              <Link to="/deals" className="nav-link">Deals</Link>
              <Link to="/assistant" className="nav-link">AI Assistant</Link>
              {user?.isBusinessOwner && (
                <Link to="/dashboard" className="nav-link">Dashboard</Link>
              )}
            </>
          )}
        </nav>

        <div className="auth-section">
          {isAuthenticated ? (
            <>
              <span className="user-email">{user?.email}</span>
              <button onClick={handleLogout} className="btn btn-secondary">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">Login</Link>
              <Link to="/register" className="btn btn-primary">Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
