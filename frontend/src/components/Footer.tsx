import React from 'react';
import '../styles/Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h3>LocalDiscover</h3>
          <p>Discover local businesses in your area</p>
        </div>

        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/about">About Us</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/business-signup">For Businesses</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Legal</h4>
          <ul>
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Connect</h4>
          <p>support@localdiscover.com</p>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2024 LocalDiscover. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
