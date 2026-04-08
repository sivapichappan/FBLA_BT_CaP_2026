#!/bin/bash

# LocalDiscover Automated Setup Script
# This script will guide you through setting up the application

set -e  # Exit on error

echo "🚀 LocalDiscover Setup Script"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Step 1: Checking Prerequisites..."
echo "-----------------------------------"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is installed: $NODE_VERSION"
else
    print_error "Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_success "npm is installed: $NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

# Check PostgreSQL
if command_exists psql; then
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL is installed: $PSQL_VERSION"
else
    print_error "PostgreSQL is not installed"
    echo ""
    echo "Install PostgreSQL:"
    echo "  macOS: brew install postgresql@15"
    echo "  Ubuntu: sudo apt-get install postgresql"
    echo "  Windows: Download from https://www.postgresql.org/download/"
    exit 1
fi

echo ""
echo "Step 2: Installing Dependencies..."
echo "-----------------------------------"

# Install root dependencies
print_info "Installing root dependencies..."
npm install

# Install backend dependencies
print_info "Installing backend dependencies..."
cd backend
npm install
cd ..

# Install frontend dependencies
print_info "Installing frontend dependencies..."
cd frontend
npm install
cd ..

print_success "All dependencies installed!"

echo ""
echo "Step 3: Database Setup..."
echo "-------------------------"

# Check if PostgreSQL is running
if pg_isready >/dev/null 2>&1; then
    print_success "PostgreSQL is running"
else
    print_warning "PostgreSQL is not running. Starting it..."

    # Try to start PostgreSQL based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew services start postgresql@15 || brew services start postgresql
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo systemctl start postgresql
    fi

    sleep 2

    if pg_isready >/dev/null 2>&1; then
        print_success "PostgreSQL started"
    else
        print_error "Could not start PostgreSQL automatically"
        echo "Please start PostgreSQL manually and run this script again"
        exit 1
    fi
fi

# Get database credentials
echo ""
print_info "Database Configuration"
echo "Please enter your PostgreSQL credentials:"
read -p "Database user (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "Database password: " DB_PASSWORD
echo ""

DB_NAME="business_discovery"

# Test database connection
print_info "Testing database connection..."
export PGPASSWORD=$DB_PASSWORD
if psql -U $DB_USER -d postgres -c "SELECT 1" >/dev/null 2>&1; then
    print_success "Database connection successful"
else
    print_error "Could not connect to database"
    echo "Please check your credentials and try again"
    exit 1
fi

# Create database
print_info "Creating database '$DB_NAME'..."
psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME" 2>/dev/null || print_warning "Database may already exist"

# Run migrations
print_info "Running database migrations..."
cd backend
export DB_USER=$DB_USER
export DB_PASSWORD=$DB_PASSWORD
export DB_NAME=$DB_NAME
export DB_HOST=localhost
export DB_PORT=5432

# Create temporary migration script
cat > temp_migrate.js << 'EOF'
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'business_discovery',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  try {
    console.log('Running migrations...');
    const schemaPath = path.join(__dirname, 'src', 'scripts', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✓ Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
EOF

node temp_migrate.js
rm temp_migrate.js
cd ..

print_success "Database setup complete!"

echo ""
echo "Step 4: Environment Configuration..."
echo "-------------------------------------"

# Generate random secrets
print_info "Generating secure random secrets..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

print_success "Secrets generated"

# Get API keys
echo ""
print_warning "You need to obtain the following API keys:"
echo ""
echo "1. Google Maps API Key"
echo "   → https://console.cloud.google.com/"
echo "   Enable: Maps JavaScript API, Geocoding API, Places API"
echo ""
echo "2. OpenAI API Key"
echo "   → https://platform.openai.com/api-keys"
echo ""
echo "3. Google reCAPTCHA Keys (v3)"
echo "   → https://www.google.com/recaptcha/admin"
echo ""

read -p "Google Maps API Key: " GOOGLE_MAPS_KEY
read -p "OpenAI API Key: " OPENAI_KEY
read -p "reCAPTCHA Site Key: " RECAPTCHA_SITE_KEY
read -p "reCAPTCHA Secret Key: " RECAPTCHA_SECRET_KEY

# Create backend .env
print_info "Creating backend/.env..."
cat > backend/.env << EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Secret
JWT_SECRET=$JWT_SECRET

# Encryption Key
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Google Maps API Key
GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_KEY

# OpenAI API Key
OPENAI_API_KEY=$OPENAI_KEY

# reCAPTCHA Keys
RECAPTCHA_SITE_KEY=$RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY=$RECAPTCHA_SECRET_KEY

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
EOF

print_success "Backend environment configured"

# Create frontend .env
print_info "Creating frontend/.env..."
cat > frontend/.env << EOF
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_KEY
VITE_RECAPTCHA_SITE_KEY=$RECAPTCHA_SITE_KEY
EOF

print_success "Frontend environment configured"

echo ""
echo "=============================="
print_success "Setup Complete! 🎉"
echo "=============================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start the application:"
echo "   npm run dev"
echo ""
echo "2. Open your browser:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo ""
echo "3. Create your first user account and start exploring!"
echo ""
print_warning "Keep your .env files secure and never commit them to git!"
echo ""
