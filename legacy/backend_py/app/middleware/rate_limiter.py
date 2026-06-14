from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Rate limit strings for use in route decorators
GENERAL_LIMIT = "100/15minutes"
AUTH_LIMIT = "5/15minutes"
SEARCH_LIMIT = "30/minute"
