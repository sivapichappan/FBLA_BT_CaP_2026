import os
import re
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


def _convert_placeholders(sql: str, params):
    """Convert $1, $2, ... PostgreSQL placeholders to %s for psycopg2.

    Handles repeated references: $1 used multiple times in the SQL gets the
    same value duplicated in the output params list, so the count of %s
    placeholders matches the count of values passed to psycopg2.
    """
    if not params:
        return re.sub(r'\$\d+', '%s', sql), params

    new_params = []
    def replace(match):
        idx = int(match.group(1)) - 1
        new_params.append(params[idx])
        return '%s'
    new_sql = re.sub(r'\$(\d+)', replace, sql)
    return new_sql, new_params


def query(text: str, params: list | tuple | None = None) -> dict:
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            converted_sql, converted_params = _convert_placeholders(text, params)
            cur.execute(converted_sql, converted_params)
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
