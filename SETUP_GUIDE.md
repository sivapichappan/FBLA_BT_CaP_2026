# LocalDiscover - Complete Setup Guide

This guide will walk you through setting up the LocalDiscover application from scratch.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [API Keys Setup](#api-keys-setup)
5. [Running the Application](#running-the-application)
6. [Testing the Application](#testing-the-application)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software
- **Node.js** (v18.0.0 or higher)
  - Download from: https://nodejs.org/
  - Verify installation: `node --version`

- **PostgreSQL** (v13.0 or higher)
  - macOS: `brew install postgresql@15`
  - Windows: Download from https://www.postgresql.org/download/
  - Linux: `sudo apt-get install postgresql postgresql-contrib`
  - Verify installation: `psql --version`

- **npm** (comes with Node.js)
  - Verify installation: `npm --version`

- **Git** (optional, for version control)
  - Download from: https://git-scm.com/

## Initial Setup

### Step 1: Install Dependencies

Open your terminal and navigate to the project directory:

```bash
cd FBLA2526
```

Install all dependencies (backend and frontend):

```bash
npm run install:all
```

This command will:
1. Install root dependencies
2. Install backend dependencies
3. Install frontend dependencies

### Step 2: Verify Installation

Check that all packages were installed successfully:

```bash
# Check backend
cd backend
ls node_modules/

# Check frontend
cd ../frontend
ls node_modules/
```

## Database Configuration

### Step 1: Start PostgreSQL

macOS (Homebrew):
```bash
brew services start postgresql@15
```

Windows:
```
# PostgreSQL should start automatically as a service
# If not, use the pgAdmin application
```

Linux:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database

```bash
# Login to PostgreSQL
psql postgres

# Create a new database
CREATE DATABASE business_discovery;

# Create a user (optional, you can use your existing postgres user)
CREATE USER your_username WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE business_discovery TO your_username;

# Exit psql
\q
```

### Step 3: Run Database Migration

From the project root:

```bash
cd backend
npm run db:migrate
```

This will create all necessary tables, indexes, and triggers.

### Step 4: Verify Database Setup

```bash
psql business_discovery

# List all tables
\dt

# You should see:
# - users
# - businesses
# - reviews
# - favorites
# - deals
# - analytics_events
# - deal_redemptions
# - verification_tokens

\q
```

## API Keys Setup

You'll need to obtain API keys from several services:

### 1. Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable these APIs:
   - Maps JavaScript API
   - Geocoding API
   - Places API
4. Create credentials → API Key
5. Restrict the key (optional but recommended):
   - HTTP referrers for frontend
   - IP addresses for backend
6. Copy your API key

### 2. OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create new secret key
5. Copy the key (you won't see it again!)

### 3. Google reCAPTCHA Keys

1. Go to [reCAPTCHA Admin](https://www.google.com/recaptcha/admin)
2. Register a new site
3. Choose reCAPTCHA v3
4. Add your domains:
   - localhost (for development)
   - Your production domain
5. You'll get:
   - Site Key (for frontend)
   - Secret Key (for backend)

### 4. Generate Secret Keys

Generate secure random strings for JWT and encryption:

```bash
# Method 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Method 2: Using OpenSSL
openssl rand -hex 32
```

Run this command twice to generate two different keys.

### Step 5: Configure Environment Variables

#### Backend Environment (.env)

Create a file named `.env` in the `backend` directory:

```bash
cd backend
cp ../.env.example .env
```

Edit `.env` with your actual values:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=business_discovery
DB_USER=your_db_username
DB_PASSWORD=your_db_password

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Secret (use the first random key you generated)
JWT_SECRET=your_generated_random_key_1

# Encryption Key (use the second random key you generated)
ENCRYPTION_KEY=your_generated_random_key_2

# Google Maps API Key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# reCAPTCHA Keys
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

#### Frontend Environment (.env)

Create a file named `.env` in the `frontend` directory:

```bash
cd ../frontend
touch .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
```

## Running the Application

### Option 1: Run Both Servers Together (Recommended)

From the project root:

```bash
npm run dev
```

This starts:
- Backend server on http://localhost:5000
- Frontend development server on http://localhost:3000

### Option 2: Run Servers Separately

Terminal 1 (Backend):
```bash
cd backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### Verify Servers Are Running

1. **Backend Health Check**
   - Open: http://localhost:5000/api/health
   - You should see: `{"status":"OK","timestamp":"..."}`

2. **Frontend**
   - Open: http://localhost:3000
   - You should see the LocalDiscover homepage

## Testing the Application

### 1. Create a Test User

1. Navigate to http://localhost:3000/register
2. Fill in the registration form:
   - Email: test@example.com
   - Password: TestPassword123
   - Full Name: Test User
3. Complete the reCAPTCHA
4. Click "Sign Up"
5. You should be automatically logged in

### 2. Test Location Features

1. Click "Enable Location" button
2. Allow location access in your browser
3. The map should center on your location
4. Nearby businesses should appear (if any in database)

### 3. Add Sample Business Data

You can add sample businesses through the API:

```bash
# Get your auth token first (from login response or browser localStorage)
TOKEN="your_jwt_token_here"

# Create a sample business
curl -X POST http://localhost:5000/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Sample Coffee Shop",
    "category": "Food & Beverage",
    "description": "Great local coffee shop",
    "address": "123 Main St, City, State 12345",
    "city": "City",
    "state": "State",
    "zipCode": "12345",
    "phone": "555-0100",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "priceRange": "$$",
    "hoursOfOperation": {
      "monday": "8:00 AM - 8:00 PM",
      "tuesday": "8:00 AM - 8:00 PM"
    }
  }'
```

### 4. Test AI Assistant

1. Navigate to AI Assistant page (once implemented)
2. Ask: "Find me a cheap lunch spot"
3. The AI should provide recommendations based on nearby businesses

## Troubleshooting

### Database Connection Issues

**Error: "password authentication failed"**
```bash
# Check PostgreSQL is running
pg_isready

# Reset user password
psql postgres
ALTER USER your_username WITH PASSWORD 'new_password';
\q

# Update .env file with new password
```

**Error: "database does not exist"**
```bash
psql postgres
CREATE DATABASE business_discovery;
\q
```

### Port Already in Use

**Backend port 5000 in use:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# Or change PORT in backend/.env
```

**Frontend port 3000 in use:**
```bash
# Vite will automatically suggest another port
# Or kill the process using port 3000
lsof -i :3000
kill -9 <PID>
```

### API Key Issues

**Google Maps not loading:**
1. Check browser console for errors
2. Verify API key is correct
3. Ensure Maps JavaScript API is enabled
4. Check for billing/quota issues in Google Cloud Console

**reCAPTCHA not working:**
1. Verify site key matches domain (use localhost for development)
2. Check browser console for errors
3. Clear browser cache and cookies

**OpenAI API errors:**
1. Verify API key is valid
2. Check you have credits/billing set up
3. Ensure model name is correct (gpt-4o-mini)

### Module Not Found Errors

```bash
# Clear node_modules and reinstall
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Compilation Errors

```bash
# Backend
cd backend
npx tsc --noEmit

# Frontend
cd frontend
npx tsc --noEmit
```

### Database Migration Fails

```bash
# Drop all tables and recreate
psql business_discovery

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO your_username;
\q

# Re-run migration
npm run db:migrate
```

## Next Steps

After successful setup:

1. **Add Sample Data**: Create businesses, reviews, and deals
2. **Test All Features**: Search, reviews, favorites, deals
3. **Business Owner Features**: Upgrade a user to business owner
4. **Analytics**: View business analytics dashboard
5. **Customization**: Modify styles, add features, etc.

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production` in backend
2. Build frontend: `npm run build`
3. Use production database
4. Configure production URLs in environment variables
5. Set up HTTPS/SSL certificates
6. Configure proper CORS settings
7. Set up monitoring and logging

## Support

If you encounter issues not covered in this guide:

1. Check the main README.md
2. Review error logs in the console
3. Check database logs: `tail -f /usr/local/var/log/postgres.log`
4. Create an issue on GitHub

## Development Tips

- Use `console.log()` for debugging
- Check browser Network tab for API call issues
- Use PostgreSQL client (pgAdmin, TablePlus, etc.) to view data
- Install React Developer Tools browser extension
- Use Postman or Insomnia to test API endpoints directly

Happy coding!
