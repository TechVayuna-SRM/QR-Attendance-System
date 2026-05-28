from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from flask_jwt_extended.exceptions import NoAuthorizationError
from jwt.exceptions import ExpiredSignatureError
from db import execute_query


def _get_live_role(user_id):
    """Always fetch the current role from DB — never trust the JWT claim alone."""
    rows = execute_query("SELECT role FROM users WHERE id=%s", (user_id,), fetch=True)
    return rows[0]["role"] if rows else None


def _jwt_error_response():
    """Return the right error shape so the frontend interceptor can refresh."""
    try:
        verify_jwt_in_request()
        return None  # token is valid
    except Exception as e:
        msg = str(e).lower()
        if "expired" in msg:
            return jsonify({"error": "Token expired", "code": "token_expired"}), 401
        return jsonify({"error": "Unauthorized"}), 401


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        err = _jwt_error_response()
        if err:
            return err
        user_id = get_jwt_identity()
        request.user_id = int(user_id)
        request.role = _get_live_role(user_id)
        return f(*args, **kwargs)
    return decorated


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            err = _jwt_error_response()
            if err:
                return err
            user_id = get_jwt_identity()
            role = _get_live_role(user_id)
            if role not in roles:
                return jsonify({"error": "Forbidden"}), 403
            request.user_id = int(user_id)
            request.role = role
            return f(*args, **kwargs)
        return decorated
    return decorator
