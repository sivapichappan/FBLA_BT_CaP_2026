# LocalDiscover - Full-Stack Business Discovery Platform

A comprehensive full-stack web application for discovering local businesses with AI-powered recommendations, interactive maps, reviews, deals, and business analytics.

## Features

### Core Features
- **Location-Based Discovery**: Google Maps integration with interactive markers
- **Smart Search Engine**: Filter by category, price range, distance, ratings, and hours
- **User Reviews & Ratings**: Verified review system with star ratings
- **Favorites System**: Bookmark businesses for quick access
- **Deals & Coupons**: Special promotions from local businesses
- **AI Assistant**: Natural language chatbot for personalized recommendations
- **Business Analytics Dashboard**: Comprehensive analytics for business owners

### Security Features
- JWT-based authentication
- Bot prevention with reCAPTCHA v3
- Data encryption (AES-256 for sensitive data)
- Rate limiting on API endpoints
- Password hashing with bcrypt
- Input validation and sanitization
- Helmet.js security headers
- CORS protection

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with pg driver
- **Authentication**: JWT + bcrypt
- **Security**: Helmet, CORS, express-rate-limit
- **Validation**: express-validator
- **AI Integration**: OpenAI API
- **Maps**: Google Maps API
- **Bot Prevention**: Google reCAPTCHA

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **Maps**: @googlemaps/js-api-loader
- **HTTP Client**: Axios
- **Captcha**: react-google-recaptcha

## Project Structure

```
FBLA2526/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.ts
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── businessController.ts
│   │   │   ├── reviewController.ts
│   │   │   ├── favoriteController.ts
│   │   │   ├── dealController.ts
│   │   │   ├── analyticsController.ts
│   │   │   └── aiController.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── validation.ts
│   │   ├── routes/
│   │   │   ├── authRoutes.ts
│   │   │   ├── businessRoutes.ts
│   │   │   ├── reviewRoutes.ts
│   │   │   ├── favoriteRoutes.ts
│   │   │   ├── dealRoutes.ts
│   │   │   ├── analyticsRoutes.ts
│   │   │   └── aiRoutes.ts
│   │   ├── scripts/
│   │   │   ├── schema.sql
│   │   │   └── migrate.ts
│   │   ├── services/
│   │   │   └── recaptcha.ts
│   │   ├── utils/
│   │   │   ├── encryption.ts
│   │   │   └── jwt.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── MapComponent.tsx
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   └── LocationContext.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Register.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── styles/
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── .env.example
├── .gitignore
└── package.json
```

## Database Schema

### Tables
- **users**: User accounts with authentication
- **businesses**: Business listings with location data
- **reviews**: User reviews and ratings
- **favorites**: User-saved businesses
- **deals**: Promotional offers and coupons
- **analytics_events**: Business analytics tracking
- **deal_redemptions**: Deal usage tracking
- **verification_tokens**: Email verification

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v13 or higher)
- Google Maps API key
- OpenAI API key
- Google reCAPTCHA keys

### 1. Clone and Install

```bash
git clone <repository-url>
cd FBLA2526
npm run install:all
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb business_discovery
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET` (generate a random string)
- `ENCRYPTION_KEY` (generate a random string)
- `GOOGLE_MAPS_API_KEY`
- `OPENAI_API_KEY`
- `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`

### 4. Run Database Migration

```bash
cd backend
npm run db:migrate
```

### 5. Start Development Servers

From the root directory:

```bash
npm run dev
```

This starts:
- Backend API: http://localhost:5000
- Frontend: http://localhost:3000

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/location` - Update user location

### Businesses
- `POST /api/businesses` - Create business (owner only)
- `GET /api/businesses/search` - Search businesses
- `GET /api/businesses/:id` - Get business details
- `PUT /api/businesses/:id` - Update business (owner only)
- `GET /api/businesses/categories` - Get all categories

### Reviews
- `POST /api/reviews` - Create review
- `GET /api/reviews/business/:businessId` - Get business reviews
- `PUT /api/reviews/:id` - Update review
- `DELETE /api/reviews/:id` - Delete review

### Favorites
- `POST /api/favorites` - Add favorite
- `DELETE /api/favorites/:businessId` - Remove favorite
- `GET /api/favorites` - Get user favorites
- `GET /api/favorites/check/:businessId` - Check if favorited

### Deals
- `POST /api/deals` - Create deal (owner only)
- `GET /api/deals/business/:businessId` - Get business deals
- `GET /api/deals/active` - Get all active deals
- `POST /api/deals/:dealId/redeem` - Redeem deal
- `PUT /api/deals/:id` - Update deal (owner only)

### Analytics
- `GET /api/analytics/business/:businessId` - Get business analytics (owner only)
- `GET /api/analytics/business/:businessId/deals` - Get deal analytics (owner only)

### AI Assistant
- `POST /api/ai/chat` - Chat with AI assistant

## User Flows

### New User Registration
1. User visits site and clicks "Sign Up"
2. Fills registration form with email, password, full name
3. Completes reCAPTCHA verification
4. System creates account with hashed password
5. User receives JWT token and is logged in

### Business Discovery
1. User grants location access or enters address
2. Map displays with nearby business markers
3. User can filter by category, price, rating, distance
4. Clicks business to view detailed profile
5. Can read reviews, see deals, get directions

### Review System
1. Authenticated user visits business profile
2. Clicks "Leave Review" button
3. Selects star rating (1-5) and writes comment
4. Review is validated and saved
5. Business rating is automatically updated

### AI Assistant Usage
1. User navigates to AI Assistant page
2. Types natural language query (e.g., "cheap lunch near me")
3. AI processes query with context of nearby businesses
4. Returns personalized recommendations
5. User can click suggestions to view businesses

### Business Owner Dashboard
1. Business owner logs in
2. Navigates to Dashboard
3. Views analytics: profile views, reviews, favorites
4. Can create/manage deals and coupons
5. Sees redemption statistics

## Security Considerations

### Authentication & Authorization
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiration
- Protected routes require valid token
- Role-based access (business owner permissions)

### Bot Prevention
- reCAPTCHA v3 on registration and login
- Score threshold of 0.5 for human verification

### Data Protection
- Sensitive data encrypted with AES-256
- Environment variables for secrets
- SQL injection prevention via parameterized queries
- XSS protection with input validation

### Rate Limiting
- General: 100 requests per 15 minutes
- Auth: 5 attempts per 15 minutes
- Search: 30 requests per minute

## Development

### Running Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Building for Production
```bash
npm run build
```

### Code Quality
- TypeScript for type safety
- ESLint for code linting
- Consistent code formatting

## Deployment

### Backend Deployment
1. Set production environment variables
2. Run database migrations
3. Build TypeScript: `npm run build`
4. Start server: `npm start`

### Frontend Deployment
1. Set production API URL in env
2. Build: `npm run build`
3. Deploy `dist/` folder to static hosting

### Recommended Hosting
- Backend: Heroku, Railway, DigitalOcean
- Database: Heroku Postgres, AWS RDS
- Frontend: Vercel, Netlify, Cloudflare Pages

## Environment Variables

### Backend (.env)
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=business_discovery
DB_USER=your_db_user
DB_PASSWORD=your_db_password
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
OPENAI_API_KEY=your_openai_key
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues or questions:
- Create an issue on GitHub
- Email: support@localdiscover.com

## Acknowledgments

- Google Maps Platform for location services
- OpenAI for AI assistant capabilities
- PostgreSQL for robust data storage
- React and TypeScript communities
