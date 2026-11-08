
import os
from pathlib import Path

from dotenv import load_dotenv

# Project root
BASE_DIR = Path(__file__).resolve().parent

# Load local configuration
load_dotenv(BASE_DIR / ".env")

# Open Food Facts settings
BASE_URL = "https://world.openfoodfacts.org"
API_VERSION = "v2"

PRODUCT_API_URL = f"{BASE_URL}/api/{API_VERSION}/product"
SEARCH_API_URL = f"{BASE_URL}/api/{API_VERSION}/search"
PRODUCT_PAGE_URL = f"{BASE_URL}/product"

CONTACT_EMAIL = os.getenv("OFF_CONTACT_EMAIL", "").strip()

if not CONTACT_EMAIL:
    raise ValueError(
        "Missing OFF_CONTACT_EMAIL. Add it to your .env file."
    )

USER_AGENT = f"OFFNetworkLab/1.0 ({CONTACT_EMAIL})"

REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
}

COUNTRY_TAG = os.getenv("OFF_COUNTRY_TAG", "en:france")

# Rate limiting
PRODUCT_REQUEST_INTERVAL = 5.0
SEARCH_REQUEST_INTERVAL = 7.0
REQUEST_TIMEOUT = 30

# Dataset settings
ML_DATASET_SIZE = 200
BENCHMARK_DATASET_SIZE = 40
RANDOM_SEED = 42

CATEGORIES = {
    "breakfast-cereals": 50,
    "biscuits": 50,
    "chocolates": 50,
    "yogurts": 50,
}

# Required output columns
CSV_COLUMNS = [
    "barcode",
    "product_name",
    "brand",
    "category",
    "sugar_100g",
    "fat_100g",
    "protein_100g",
    "salt_100g",
    "calories_100g",
    "calories_estimated",
    "nutriscore",
]

# Fields requested from API v2
API_FIELDS = [
    "code",
    "product_name",
    "brands",
    "nutriments",
    "nutriscore_grade",
]

# Request log columns
REQUEST_LOG_COLUMNS = [
    "timestamp_utc",
    "method",
    "run_id",
    "barcode",
    "url",
    "status_code",
    "latency_ms",
    "wait_seconds",
    "success",
    "error",
]

# Project paths
DATA_DIR = BASE_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
RAW_DIR = DATA_DIR / "raw"

NETWORK_RESULTS_DIR = BASE_DIR / "networking" / "results"
