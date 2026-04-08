# LocalDiscover - Quick Start Guide

Get your LocalDiscover application running in under 10 minutes!

## Prerequisites

✅ Node.js 18+ installed
✅ PostgreSQL 13+ installed
✅ Basic terminal/command line knowledge

## Step 1: Install Dependencies (2 minutes)

```bash
cd FBLA2526
npm run install:all
```

This installs all packages for both backend and frontend.

## Step 2: Setup Database (2 minutes)

```bash
# Start PostgreSQL
macOS: brew services start postgresql@15
# Windows: Should auto-start
# Linux: sudo systemctl start postgresql

# Create database
psql postgres
CREATE DATABASE business_discovery;
\q

# Run migrations
cd backend
npm run db:migrate
```

## Step 3: Configure Environment (3 minutes)

### Get API Keys

You'll need these 3 API keys:

1. **Google Maps API**: https://console.cloud.google.com/

   - Enable: Maps JavaScript API
   - Create API key

2. **OpenAI API**: https://platform.openai.com/api-keys
   -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

3. **reCAPTCHA**: https://www.google.com/recaptcha/admin
   - Choose v3
   - Get site key: 6LcyGxMsAAAAALa2SAw6Hs_c72_qsur-d0ZGNDpu
   - secret key:
     6LcyGxMsAAAAAH_HIKiQU0fmfBIMRaQ8mMaJkivI

### Backend .env

Create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=business_discovery
DB_USER=postgres
DB_PASSWORD=your_postgres_password

PORT=5000
NODE_ENV=development

JWT_SECRET=your-random-32-char-string-here-change-me
ENCRYPTION_KEY=another-random-32-char-string-change-me

GOOGLE_MAPS_API_KEY=your_google_maps_key
OPENAI_API_KEY=your_openai_api_key
RECAPTCHA_SITE_KEY=6LcyGxMsAAAAALa2SAw6Hs_c72_qsur-d0ZGNDpu
RECAPTCHA_SECRET_KEY=6LcyGxMsAAAAAH_HIKiQU0fmfBIMRaQ8mMaJkivI

FRONTEND_URL=http://localhost:3000
```

💡 **Generate random secrets:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Frontend .env

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=
VITE_RECAPTCHA_SITE_KEY=6LcyGxMsAAAAALa2SAw6Hs_c72_qsur-d0ZGNDpu
```

## Step 4: Run the Application (1 minute)

From the project root:

```bash
npm run dev
```

This starts both servers:

- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:3000

## Step 5: Test It Works

1. **Open browser**: http://localhost:3000
2. **Click "Sign Up"**
3. **Create account** with:
   - Email: test@example.com
   - Password: TestPassword123
   - Complete reCAPTCHA
4. **You're in!** 🎉

## What You Can Do Now

### As a User:

- ✅ Search for businesses
- ✅ View on interactive map
- ✅ Read/write reviews
- ✅ Save favorites
- ✅ Browse deals
- ✅ Chat with AI assistant

### Add Sample Business (Optional)

To test with actual data, add a sample business via API:

```bash
# 1. Login and copy the token from browser localStorage
# 2. Use this curl command:

curl -X POST http://localhost:5000/api/businesses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Sample Coffee Shop",
    "category": "Food & Beverage",
    "description": "Great local coffee",
    "address": "123 Main St, Your City",
    "city": "Your City",
    "state": "CA",
    "zipCode": "12345",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "priceRange": "$$"
  }'
```

## Common Issues

### Port Already in Use

```bash
# Kill process on port 5000
lsof -i :5000
kill -9 <PID>
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready

# Check credentials in backend/.env
```

### Maps Not Loading

- Verify Google Maps API key is correct
- Check browser console for errors
- Ensure Maps JavaScript API is enabled in Google Cloud Console

### reCAPTCHA Errors

- Verify site key matches localhost
- Check both keys are correct
- Clear browser cache

## Next Steps

1. **Read the full documentation**:

   - [README.md](README.md) - Full feature overview
   - [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup
   - [API_REFERENCE.md](API_REFERENCE.md) - API endpoints
   - [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - Architecture

2. **Customize the app**:

   - Add more business categories
   - Customize styles in `frontend/src/styles/`
   - Add more AI assistant features
   - Implement additional pages

3. **Deploy to production**:
   - Follow [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
   - Recommended hosting: Vercel (frontend) + Railway (backend)

## Project Structure

```
FBLA2526/
├── backend/           # Express API server
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth, validation
│   │   ├── services/      # External APIs
│   │   └── utils/         # Helper functions
│   └── package.json
├── frontend/          # React app
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Route pages
│   │   ├── contexts/      # Global state
│   │   └── styles/        # CSS files
│   └── package.json
└── package.json       # Root commands
```

## Available Commands

```bash
# Install all dependencies
npm run install:all

# Run both servers
npm run dev

# Run backend only
npm run dev:backend

# Run frontend only
npm run dev:frontend

# Build for production
npm run build

# Database migration
cd backend && npm run db:migrate
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Maps**: Google Maps API
- **AI**: OpenAI GPT-4o-mini
- **Auth**: JWT + bcrypt + reCAPTCHA

## Features Implemented

✅ User authentication with bot prevention
✅ Location-based business discovery
✅ Interactive Google Maps integration
✅ Advanced search with multiple filters
✅ User reviews and ratings system
✅ Favorites/bookmarking
✅ Deals and coupons
✅ AI-powered recommendation chatbot
✅ Business owner analytics dashboard
✅ Responsive mobile-friendly design
✅ Enterprise-grade security

## Getting Help

- **Documentation**: Check the markdown files in project root
- **API Testing**: Use the curl examples in API_REFERENCE.md
- **Database**: Use psql or pgAdmin to view data
- **Debugging**: Check browser console and terminal logs

## Tips for Development

1. **Use browser DevTools**: Network tab for API calls, Console for errors
2. **Install React DevTools**: Browser extension for component debugging
3. **Use Postman/Insomnia**: Test API endpoints directly
4. **Check logs**: Backend terminal shows all API requests
5. **Database GUI**: Use TablePlus, pgAdmin, or DBeaver to view data

## What's Next?

Once you're comfortable with the basics:

1. **Add more pages**: Search, Business Profile, Favorites, Deals, AI Assistant
2. **Implement business owner features**: Dashboard, create/edit businesses
3. **Add image uploads**: For business photos
4. **Implement notifications**: Email or in-app
5. **Add social features**: Follow businesses, share reviews
6. **Mobile app**: Use React Native to create mobile version

## Support

If you run into issues:

1. Check the [SETUP_GUIDE.md](SETUP_GUIDE.md) troubleshooting section
2. Review console logs for error messages
3. Verify all environment variables are set correctly
4. Check that all external APIs are configured properly

---

**Congratulations!** You now have a fully functional local business discovery platform! 🎊

Start exploring the code, add features, and make it your own!
