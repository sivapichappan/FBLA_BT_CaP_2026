import sys
import os

# Add backend_py to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_py"))

from mangum import Mangum
from app.main import app

handler = Mangum(app)
