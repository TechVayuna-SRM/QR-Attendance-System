import mysql.connector
from config import Config

def get_connection():
    if not Config.DB_PASSWORD:
        raise RuntimeError("DB_PASSWORD is not set in environment variables")
    return mysql.connector.connect(
        host=Config.DB_HOST,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME
    )

def execute_query(query, params=None, fetch=False):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, params or ())
    if fetch:
        result = cursor.fetchall()
        cursor.close()
        conn.close()
        return result
    conn.commit()
    last_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return last_id
