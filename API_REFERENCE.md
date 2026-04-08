# API Reference Guide

Base URL: `http://localhost:5000/api`

## Authentication

All protected endpoints require the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Auth Endpoints

### Register User
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "fullName": "John Doe",
  "recaptchaToken": "token_from_recaptcha"
}
```

**Response:** `201 Created`
```json
{
  "message": "User registered successfully",
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "isBusinessOwner": false,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "recaptchaToken": "token_from_recaptcha"
}
```

**Response:** `200 OK`
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "isBusinessOwner": false
  }
}
```

### Get User Profile
```http
GET /auth/profile
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "location_lat": 37.7749,
    "location_lng": -122.4194,
    "is_business_owner": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Update Location
```http
PUT /auth/location
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "latitude": 37.7749,
  "longitude": -122.4194
}
```

**Response:** `200 OK`
```json
{
  "message": "Location updated successfully"
}
```

---

## Business Endpoints

### Search Businesses
```http
GET /businesses/search?query=coffee&latitude=37.7749&longitude=-122.4194&radius=10&category=Food&priceRange=$$&minRating=4&limit=20&offset=0
```

**Query Parameters:**
- `query` (optional): Search text for name/description
- `latitude` (optional): User's latitude
- `longitude` (optional): User's longitude
- `radius` (optional): Search radius in km (default: 10)
- `category` (optional): Business category
- `priceRange` (optional): $, $$, $$$, $$$$
- `minRating` (optional): Minimum average rating (1-5)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "businesses": [
    {
      "id": "uuid",
      "name": "Coffee Shop",
      "category": "Food & Beverage",
      "description": "Best coffee in town",
      "address": "123 Main St",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "price_range": "$$",
      "avg_rating": 4.5,
      "review_count": 42,
      "distance_km": 2.3
    }
  ],
  "total": 1
}
```

### Get Business by ID
```http
GET /businesses/:id
```

**Response:** `200 OK`
```json
{
  "business": {
    "id": "uuid",
    "name": "Coffee Shop",
    "category": "Food & Beverage",
    "description": "Best coffee in town",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zip_code": "94102",
    "phone": "555-0100",
    "website": "https://coffeeshop.com",
    "email": "info@coffeeshop.com",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "price_range": "$$",
    "hours_of_operation": {
      "monday": "8:00 AM - 8:00 PM",
      "tuesday": "8:00 AM - 8:00 PM"
    },
    "photo_urls": ["url1", "url2"],
    "avg_rating": 4.5,
    "review_count": 42
  }
}
```

### Create Business
```http
POST /businesses
Authorization: Bearer <token>
Business Owner Only
```

**Request Body:**
```json
{
  "name": "New Business",
  "category": "Retail",
  "description": "Description here",
  "address": "123 Main St",
  "city": "City",
  "state": "State",
  "zipCode": "12345",
  "phone": "555-0100",
  "website": "https://example.com",
  "email": "info@example.com",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "priceRange": "$$",
  "hoursOfOperation": {
    "monday": "9:00 AM - 5:00 PM"
  },
  "photoUrls": ["url1", "url2"]
}
```

**Response:** `201 Created`
```json
{
  "message": "Business created successfully",
  "business": { /* business object */ }
}
```

### Update Business
```http
PUT /businesses/:id
Authorization: Bearer <token>
Business Owner Only (must own the business)
```

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Name",
  "description": "New description",
  "phone": "555-0200"
}
```

**Response:** `200 OK`
```json
{
  "message": "Business updated successfully",
  "business": { /* updated business */ }
}
```

### Get Categories
```http
GET /businesses/categories
```

**Response:** `200 OK`
```json
{
  "categories": [
    "Food & Beverage",
    "Retail",
    "Services",
    "Healthcare"
  ]
}
```

---

## Review Endpoints

### Create Review
```http
POST /reviews
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "businessId": "uuid",
  "rating": 5,
  "comment": "Great service!"
}
```

**Response:** `201 Created`
```json
{
  "message": "Review created successfully",
  "review": {
    "id": "uuid",
    "user_id": "uuid",
    "business_id": "uuid",
    "rating": 5,
    "comment": "Great service!",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Get Business Reviews
```http
GET /reviews/business/:businessId?sortBy=recent&limit=20&offset=0
```

**Query Parameters:**
- `sortBy`: `recent`, `rating_high`, `rating_low`
- `limit`: Results per page (default: 20)
- `offset`: Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Great!",
      "createdAt": "2024-01-01T00:00:00Z",
      "userName": "John Doe"
    }
  ]
}
```

### Update Review
```http
PUT /reviews/:id
Authorization: Bearer <token>
Must own the review
```

**Request Body:**
```json
{
  "rating": 4,
  "comment": "Updated comment"
}
```

**Response:** `200 OK`

### Delete Review
```http
DELETE /reviews/:id
Authorization: Bearer <token>
Must own the review
```

**Response:** `200 OK`
```json
{
  "message": "Review deleted successfully"
}
```

---

## Favorite Endpoints

### Add Favorite
```http
POST /favorites
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "businessId": "uuid"
}
```

**Response:** `201 Created`
```json
{
  "message": "Business added to favorites"
}
```

### Remove Favorite
```http
DELETE /favorites/:businessId
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Business removed from favorites"
}
```

### Get User Favorites
```http
GET /favorites
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "favorites": [
    {
      /* business object with favorited_at timestamp */
    }
  ]
}
```

### Check if Favorited
```http
GET /favorites/check/:businessId
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "isFavorite": true
}
```

---

## Deal Endpoints

### Create Deal
```http
POST /deals
Authorization: Bearer <token>
Business Owner Only
```

**Request Body:**
```json
{
  "businessId": "uuid",
  "title": "50% Off Lunch",
  "description": "Valid Mon-Fri 11AM-2PM",
  "discountAmount": "50%",
  "terms": "Cannot be combined with other offers",
  "expirationDate": "2024-12-31T23:59:59Z",
  "redemptionLimit": 100
}
```

**Response:** `201 Created`
```json
{
  "message": "Deal created successfully",
  "deal": { /* deal object */ }
}
```

### Get Business Deals
```http
GET /deals/business/:businessId
```

**Response:** `200 OK`
```json
{
  "deals": [
    {
      "id": "uuid",
      "title": "50% Off Lunch",
      "description": "Valid Mon-Fri",
      "discount_amount": "50%",
      "expiration_date": "2024-12-31",
      "times_redeemed": 15,
      "redemption_limit": 100,
      "is_active": true
    }
  ]
}
```

### Get All Active Deals
```http
GET /deals/active?latitude=37.7749&longitude=-122.4194&radius=10&limit=20
```

**Query Parameters:**
- `latitude`, `longitude`, `radius`: Location filter
- `limit`: Results limit

**Response:** `200 OK`
```json
{
  "deals": [
    {
      /* deal object with business info */
      "business_name": "Coffee Shop",
      "category": "Food"
    }
  ]
}
```

### Redeem Deal
```http
POST /deals/:dealId/redeem
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Deal redeemed successfully"
}
```

### Update Deal
```http
PUT /deals/:id
Authorization: Bearer <token>
Business Owner Only
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "isActive": false
}
```

**Response:** `200 OK`

---

## Analytics Endpoints

### Get Business Analytics
```http
GET /analytics/business/:businessId?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
Business Owner Only
```

**Response:** `200 OK`
```json
{
  "analytics": {
    "profileViews": 1250,
    "searchAppearances": 3400,
    "reviewsPosted": 45,
    "totalFavorites": 89,
    "dealsRedeemed": 120,
    "averageRating": "4.50",
    "ratingDistribution": [
      { "rating": 5, "count": 30 },
      { "rating": 4, "count": 10 }
    ],
    "viewsTrend": [
      { "date": "2024-01-01", "count": 50 },
      { "date": "2024-01-02", "count": 45 }
    ]
  }
}
```

### Get Deal Analytics
```http
GET /analytics/business/:businessId/deals
Authorization: Bearer <token>
Business Owner Only
```

**Response:** `200 OK`
```json
{
  "dealAnalytics": [
    {
      "id": "uuid",
      "title": "50% Off Lunch",
      "times_redeemed": 45,
      "redemption_limit": 100,
      "created_at": "2024-01-01",
      "expiration_date": "2024-12-31",
      "is_active": true
    }
  ]
}
```

---

## AI Assistant Endpoint

### Chat with AI
```http
POST /ai/chat
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "message": "Find me a cheap Italian restaurant nearby",
  "latitude": 37.7749,
  "longitude": -122.4194
}
```

**Response:** `200 OK`
```json
{
  "response": "I'd recommend Mario's Pizza on Main St. It's affordable ($$) with a 4.5 star rating and only 1.2km away. They have great lunch specials!",
  "suggestions": [
    {
      "name": "Mario's Pizza",
      "category": "Italian",
      "rating": "4.5"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

Or with validation details:
```json
{
  "errors": [
    {
      "field": "email",
      "message": "Valid email is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "No token provided"
}
```

```json
{
  "error": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied. Business owner only."
}
```

### 404 Not Found
```json
{
  "error": "Business not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limits

- **General API**: 100 requests per 15 minutes
- **Authentication endpoints**: 5 requests per 15 minutes
- **Search endpoint**: 30 requests per minute

Rate limit headers included in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## Testing with cURL

### Register and Login
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "fullName": "Test User",
    "recaptchaToken": "test_token"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "recaptchaToken": "test_token"
  }'
```

### Search Businesses
```bash
curl "http://localhost:5000/api/businesses/search?latitude=37.7749&longitude=-122.4194&radius=10"
```

### Create Review (with auth)
```bash
curl -X POST http://localhost:5000/api/reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "businessId": "business-uuid",
    "rating": 5,
    "comment": "Excellent!"
  }'
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- UUIDs are used for all IDs
- Pagination uses limit/offset pattern
- Location coordinates use decimal degrees
- Distance calculations use kilometers
- Ratings are integers 1-5
- Price ranges: $, $$, $$$, $$$$
