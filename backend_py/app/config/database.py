import os
import psycopg2
import psycopg2.pool
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=database_url,
                sslmode="require",
            )
        else:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                dbname=os.getenv("DB_NAME", "business_discovery"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", ""),
            )
    return _pool


def query(text: str, params: list | tuple | None = None) -> dict:
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(text, params)
            if cur.description:
                rows = cur.fetchall()
                return {"rows": [dict(r) for r in rows]}
            conn.commit()
            return {"rows": []}
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def get_client():
    pool = get_pool()
    conn = pool.getconn()
    conn.autocommit = False
    return conn, pool
