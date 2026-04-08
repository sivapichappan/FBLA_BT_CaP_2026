# Production Deployment Checklist

Use this checklist to ensure your LocalDiscover application is production-ready.

## Pre-Deployment

### Code Quality
- [ ] All TypeScript errors resolved (`tsc --noEmit`)
- [ ] No console.log statements in production code
- [ ] Error handling implemented for all API endpoints
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention verified (parameterized queries)
- [ ] XSS prevention verified (input sanitization)

### Security
- [ ] All environment variables configured
- [ ] Strong JWT secret generated (32+ characters)
- [ ] Strong encryption key generated (32+ characters)
- [ ] Database credentials secured
- [ ] API keys secured and restricted
- [ ] CORS configured for production domain only
- [ ] Rate limiting enabled
- [ ] Helmet.js security headers configured
- [ ] HTTPS/SSL certificates obtained
- [ ] Password requirements enforced (min 8 chars)
- [ ] reCAPTCHA properly configured

### Database
- [ ] Production database created
- [ ] Database migrations run successfully
- [ ] Database backup strategy configured
- [ ] Connection pooling configured (max 20)
- [ ] All indexes created
- [ ] Database credentials rotated from defaults

### Environment Variables
- [ ] Backend .env file created with production values
- [ ] Frontend .env file created with production values
- [ ] No .env files committed to git
- [ ] Production URLs configured correctly
- [ ] API keys validated and working

## Backend Deployment

### Build & Test
- [ ] `npm run build` successful
- [ ] No build warnings
- [ ] All dependencies installed (`npm ci`)
- [ ] Test suite passing
- [ ] API health check working (`/api/health`)

### Configuration
- [ ] `NODE_ENV=production` set
- [ ] Production port configured
- [ ] Database connection string correct
- [ ] CORS whitelist updated
- [ ] File upload limits set (if applicable)
- [ ] Logging configured (Winston, Bunyan, etc.)
- [ ] Error tracking setup (Sentry, Rollbar, etc.)

### Hosting Setup
- [ ] Server/hosting provider selected
- [ ] Node.js version matches development (18+)
- [ ] PostgreSQL accessible from backend
- [ ] Environment variables set on hosting platform
- [ ] Build command configured: `npm run build`
- [ ] Start command configured: `npm start`
- [ ] Auto-deploy on git push configured (optional)

## Frontend Deployment

### Build & Test
- [ ] `npm run build` successful
- [ ] No build warnings
- [ ] All assets properly bundled
- [ ] Build size acceptable (<2MB initial load)
- [ ] Source maps generated (for debugging)

### Configuration
- [ ] API URL points to production backend
- [ ] Google Maps API key configured
- [ ] reCAPTCHA site key configured
- [ ] Meta tags for SEO configured
- [ ] Favicon added
- [ ] manifest.json configured (PWA)

### Hosting Setup
- [ ] Static hosting provider selected (Vercel, Netlify, etc.)
- [ ] Custom domain configured (optional)
- [ ] SSL/HTTPS enabled
- [ ] Build command configured: `npm run build`
- [ ] Output directory configured: `dist`
- [ ] SPA routing configured (redirects to index.html)
- [ ] Environment variables set

## Database

### Production Database
- [ ] PostgreSQL 13+ running
- [ ] Database created: `business_discovery`
- [ ] User created with appropriate permissions
- [ ] Connection string tested
- [ ] SSL/TLS enabled for connections
- [ ] Backups configured (daily recommended)
- [ ] Backup restoration tested
- [ ] Database monitoring setup

### Data Migration
- [ ] Schema migration successful
- [ ] All tables created
- [ ] All indexes created
- [ ] All triggers created
- [ ] Sample data loaded (if needed)

## External Services

### Google Maps API
- [ ] API key created
- [ ] Billing enabled (required for production)
- [ ] APIs enabled:
  - [ ] Maps JavaScript API
  - [ ] Geocoding API
  - [ ] Places API
- [ ] API key restricted by domain/IP
- [ ] Usage limits set
- [ ] Billing alerts configured

### OpenAI API
- [ ] API key created
- [ ] Billing/credits configured
- [ ] Usage limits understood
- [ ] Rate limits configured
- [ ] Cost monitoring setup

### Google reCAPTCHA
- [ ] Site registered
- [ ] v3 keys obtained
- [ ] Domains configured (production + staging)
- [ ] Score threshold set (0.5 recommended)
- [ ] Challenge fallback configured

## Testing

### Functional Testing
- [ ] User registration works
- [ ] User login works
- [ ] JWT token authentication works
- [ ] Location access works
- [ ] Business search works
- [ ] Filters work correctly
- [ ] Business profiles load
- [ ] Reviews can be created
- [ ] Favorites can be added/removed
- [ ] Deals can be redeemed
- [ ] Analytics dashboard loads (business owners)
- [ ] AI assistant responds correctly

### Cross-Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### Performance Testing
- [ ] Page load time <3 seconds
- [ ] API response time <500ms
- [ ] Database queries optimized
- [ ] Images optimized
- [ ] No memory leaks
- [ ] Lighthouse score >90

### Security Testing
- [ ] SQL injection attempted and blocked
- [ ] XSS attempted and blocked
- [ ] CSRF protection verified
- [ ] Rate limiting works
- [ ] Authentication can't be bypassed
- [ ] Sensitive data encrypted
- [ ] HTTPS enforced

## Monitoring & Logging

### Error Tracking
- [ ] Sentry/Rollbar configured
- [ ] Error alerts setup
- [ ] Sourcemaps uploaded
- [ ] Test error logging works

### Analytics
- [ ] Google Analytics configured (optional)
- [ ] Custom events tracked
- [ ] Conversion funnels setup

### Performance Monitoring
- [ ] APM tool configured (New Relic, DataDog, etc.)
- [ ] Database query monitoring
- [ ] API endpoint monitoring
- [ ] Uptime monitoring (UptimeRobot, Pingdom)

### Logging
- [ ] Application logs configured
- [ ] Log rotation setup
- [ ] Log aggregation (CloudWatch, Loggly, etc.)
- [ ] Critical error alerts

## Post-Deployment

### Immediate Checks (First Hour)
- [ ] Homepage loads correctly
- [ ] API health check returns 200
- [ ] Database connection successful
- [ ] Can create new user
- [ ] Can login
- [ ] Can search businesses
- [ ] Maps load correctly
- [ ] No console errors
- [ ] SSL certificate valid

### First 24 Hours
- [ ] Monitor error rates
- [ ] Check server resources (CPU, memory)
- [ ] Monitor database connections
- [ ] Check API response times
- [ ] Review logs for issues
- [ ] Test from multiple locations
- [ ] Monitor external API usage/costs

### First Week
- [ ] Review user feedback
- [ ] Check analytics for usage patterns
- [ ] Monitor costs (APIs, hosting, database)
- [ ] Review performance metrics
- [ ] Check for security alerts
- [ ] Plan first hotfix if needed

## Rollback Plan

### If Deployment Fails
- [ ] Previous version backup available
- [ ] Database rollback script ready
- [ ] DNS can be reverted quickly
- [ ] Team notified of rollback procedure
- [ ] Rollback tested in staging

### Rollback Steps
1. Stop new deployments
2. Revert to previous git commit
3. Redeploy previous version
4. Run database rollback (if needed)
5. Verify rollback successful
6. Communicate status to users

## Documentation

### For Users
- [ ] User guide created
- [ ] FAQ page created
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Contact information available

### For Developers
- [ ] README.md up to date
- [ ] API documentation complete
- [ ] Deployment guide created
- [ ] Contributing guidelines created
- [ ] Code comments adequate

## Legal & Compliance

### Privacy
- [ ] Privacy policy reviewed
- [ ] GDPR compliance (if applicable)
- [ ] CCPA compliance (if applicable)
- [ ] User data handling documented
- [ ] Data retention policy defined
- [ ] User data deletion process

### Terms
- [ ] Terms of service reviewed
- [ ] Age restrictions noted (13+ typically)
- [ ] Content policy defined
- [ ] Refund policy (if applicable)

### APIs
- [ ] Google Maps ToS acknowledged
- [ ] OpenAI usage policy followed
- [ ] reCAPTCHA ToS acknowledged
- [ ] Attribution requirements met

## Optimization

### Performance
- [ ] Images lazy loaded
- [ ] Code splitting implemented
- [ ] Gzip compression enabled
- [ ] CDN configured for static assets
- [ ] Database queries using indexes
- [ ] Caching strategy implemented

### SEO
- [ ] Meta tags configured
- [ ] sitemap.xml created
- [ ] robots.txt configured
- [ ] Structured data added
- [ ] Page titles optimized
- [ ] Alt text for images

### Accessibility
- [ ] ARIA labels added
- [ ] Keyboard navigation works
- [ ] Screen reader tested
- [ ] Color contrast meets WCAG AA
- [ ] Form labels present

## Cost Management

### Estimated Monthly Costs
- [ ] Backend hosting: $____
- [ ] Database hosting: $____
- [ ] Frontend hosting: $____
- [ ] Google Maps API: $____
- [ ] OpenAI API: $____
- [ ] Other services: $____
- [ ] **Total: $____**

### Cost Optimization
- [ ] Free tiers utilized where possible
- [ ] Usage alerts configured
- [ ] Scaling limits set
- [ ] Unused resources removed
- [ ] API caching implemented

## Scaling Considerations

### When to Scale
- [ ] >1000 concurrent users
- [ ] Database >80% capacity
- [ ] API response time >1s
- [ ] Memory usage >80%
- [ ] CPU usage consistently >70%

### Scaling Strategy
- [ ] Horizontal scaling plan (load balancer)
- [ ] Database read replicas
- [ ] Caching layer (Redis)
- [ ] CDN for global distribution
- [ ] Microservices migration plan

## Maintenance

### Regular Tasks
- [ ] Weekly: Review error logs
- [ ] Weekly: Check uptime reports
- [ ] Monthly: Update dependencies
- [ ] Monthly: Review security advisories
- [ ] Monthly: Database optimization
- [ ] Quarterly: Security audit
- [ ] Quarterly: Performance review

### Updates
- [ ] Dependency update strategy
- [ ] Breaking change communication plan
- [ ] Staging environment for testing updates
- [ ] Automated testing for updates

## Support

### User Support
- [ ] Support email configured
- [ ] FAQ page created
- [ ] Contact form working
- [ ] Response time SLA defined
- [ ] Support ticket system (optional)

### Developer Support
- [ ] GitHub issues enabled
- [ ] Contributing guidelines published
- [ ] Code of conduct published
- [ ] Pull request template created

## Final Checks

- [ ] All team members notified of deployment
- [ ] Deployment time communicated to users
- [ ] Social media accounts updated (if applicable)
- [ ] Press release prepared (if applicable)
- [ ] Monitoring dashboards accessible
- [ ] On-call schedule defined
- [ ] Incident response plan ready

## Launch! 🚀

Once all items are checked:

1. Deploy backend
2. Deploy frontend
3. Test production environment
4. Announce launch
5. Monitor closely for 24 hours
6. Celebrate! 🎉

---

## Emergency Contacts

- **Hosting Provider Support**: _______________
- **Database Provider Support**: _______________
- **DNS Provider Support**: _______________
- **Team Lead**: _______________
- **DevOps**: _______________

## Useful Commands

```bash
# Backend health check
curl https://api.yourdomain.com/api/health

# Check SSL certificate
openssl s_client -connect yourdomain.com:443

# Database connection test
psql postgresql://user:pass@host:5432/dbname

# View server logs
tail -f /var/log/app.log

# Restart backend
pm2 restart app

# Check disk space
df -h

# Check memory
free -m
```

---

**Last Updated**: [Date]
**Deployment Date**: [Date]
**Version**: 1.0.0
