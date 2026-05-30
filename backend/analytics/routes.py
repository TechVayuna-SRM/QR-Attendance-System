import io
import datetime
from flask import Blueprint, request, jsonify, send_file
from db import execute_query
from session_auth import login_required
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.lib import colors
from attendance.utils import close_expired_sessions_and_mark_absent

analytics_bp = Blueprint("analytics", __name__)

def _build_filters(args, extra_where="", extra_params=()):
    conditions = ["1=1"]
    params = list(extra_params)
    if args.get("start_date"):
        conditions.append("a.date >= %s")
        params.append(args["start_date"])
    if args.get("end_date"):
        conditions.append("a.date <= %s")
        params.append(args["end_date"])
    if args.get("week"):
        conditions.append("WEEK(a.date, 1)=%s")
        params.append(args["week"])
    if args.get("month"):
        conditions.append("MONTH(a.date)=%s")
        params.append(args["month"])
    if args.get("year"):
        conditions.append("YEAR(a.date)=%s")
        params.append(args["year"])
    if extra_where:
        conditions.append(extra_where)
    return " AND ".join(conditions), tuple(params)

def _fetch_attendance(where, params):
    query = f"""
        SELECT u.name, u.email, u.role, d.name as domain, a.date, a.status, a.marked_at
        FROM attendance a
        JOIN users u ON a.user_id=u.id
        JOIN domains d ON a.domain_id=d.id
        WHERE {where}
        ORDER BY a.date DESC
    """
    return execute_query(query, params, fetch=True)

def _get_scope(role, user_id, args):
    """
    Returns (where, params) based on role:
    - admin       → ALL users (members + domain leads) across ALL domains
    - domain_lead → ALL users (members + this lead) in their assigned domain only
    - member      → only their own attendance for their registered domains
    """
    if role in ("admin", "faculty"):
        # Admin/Faculty: all attendance records, optional domain filter
        extra = ""
        extra_params = ()
        if args.get("domain_id"):
            extra = "a.domain_id=%s"
            extra_params = (args["domain_id"],)
        return _build_filters(args, extra, extra_params)

    elif role == "domain_lead":
        # Domain Lead: all users in their domain (members + themselves)
        lead = execute_query(
            "SELECT domain_id FROM domain_leads WHERE user_id=%s",
            (user_id,), fetch=True
        )
        if not lead:
            # fallback: use their user_domains entry
            lead_domain = execute_query(
                "SELECT domain_id FROM user_domains WHERE user_id=%s LIMIT 1",
                (user_id,), fetch=True
            )
            domain_id = lead_domain[0]["domain_id"] if lead_domain else None
        else:
            domain_id = lead[0]["domain_id"]

        if not domain_id:
            return "1=0", ()  # no domain assigned — return nothing

        return _build_filters(args, "a.domain_id=%s", (domain_id,))

    else:
        # Member: only their own attendance across their registered domains
        # Their registered domains are already in user_domains,
        # attendance is already scoped to their user_id
        return _build_filters(args, "a.user_id=%s", (user_id,))

# ── Domains (public) ─────────────────────────────────────────────
@analytics_bp.route("/domains", methods=["GET"])
def get_domains():
    rows = execute_query("SELECT * FROM domains", fetch=True)
    return jsonify(rows)

# ── Analytics Summary ────────────────────────────────────────────
@analytics_bp.route("/summary", methods=["GET"])
@login_required
def summary():
    close_expired_sessions_and_mark_absent()
    role = request.role
    args = request.args
    where, params = _get_scope(role, request.user_id, args)

    if where == "1=0":
        return jsonify({
            "total": 0, "present": 0, "absent": 0,
            "attendance_percentage": 0,
            "domain_stats": {}, "date_trend": {},
            "member_stats": {}
        })

    rows = _fetch_attendance(where, params)
    
    # Collapse multiple domain attendance records for the same user on the same date
    collapsed = {}
    for r in rows:
        key = (r["email"], r["date"])
        if key not in collapsed:
            collapsed[key] = {
                "name": r["name"],
                "email": r["email"],
                "role": r["role"],
                "date": r["date"],
                "status": r["status"],
                "marked_at": r["marked_at"],
                "all_domains": [r["domain"]]
            }
        else:
            collapsed[key]["all_domains"].append(r["domain"])
            if r["status"] == "present":
                collapsed[key]["status"] = "present"
                collapsed[key]["marked_at"] = r["marked_at"] or collapsed[key]["marked_at"]

    collapsed_rows = list(collapsed.values())
    total = len(collapsed_rows)
    present = sum(1 for r in collapsed_rows if r["status"] == "present")
    absent = total - present
    pct = round((present / total * 100), 2) if total else 0

    # Domain-wise breakdown
    domain_stats = {}
    for r in collapsed_rows:
        for d in r["all_domains"]:
            domain_stats.setdefault(d, {"present": 0, "absent": 0})
            domain_stats[d][r["status"]] += 1

    # Date-wise trend
    date_trend = {}
    for r in collapsed_rows:
        dt = str(r["date"])
        date_trend.setdefault(dt, {"present": 0, "absent": 0})
        date_trend[dt][r["status"]] += 1

    # Member-wise breakdown (for admin, faculty and domain_lead)
    member_stats = {}
    if role in ("admin", "domain_lead", "faculty"):
        for r in collapsed_rows:
            key = f"{r['name']} ({r['email']})"
            member_stats.setdefault(key, {"present": 0, "absent": 0, "role": r["role"]})
            member_stats[key][r["status"]] += 1

    return jsonify({
        "total": total, "present": present, "absent": absent,
        "attendance_percentage": pct,
        "domain_stats": domain_stats,
        "date_trend": date_trend,
        "member_stats": member_stats
    })

# ── Report Download ──────────────────────────────────────────────
@analytics_bp.route("/report", methods=["GET"])
@login_required
def download_report():
    close_expired_sessions_and_mark_absent()
    role = request.role
    fmt  = request.args.get("format", "xlsx")
    args = request.args
    where, params = _get_scope(role, request.user_id, args)

    rows = [] if where == "1=0" else _fetch_attendance(where, params)

    # Collapse multiple domain attendance records for the same user on the same date
    collapsed = {}
    for r in rows:
        key = (r["email"], r["date"])
        if key not in collapsed:
            collapsed[key] = {
                "name": r["name"],
                "email": r["email"],
                "role": r["role"],
                "domain": r["domain"],
                "date": r["date"],
                "status": r["status"],
                "marked_at": r["marked_at"],
                "all_domains": [r["domain"]]
            }
        else:
            collapsed[key]["all_domains"].append(r["domain"])
            if r["status"] == "present":
                collapsed[key]["status"] = "present"
                collapsed[key]["marked_at"] = r["marked_at"] or collapsed[key]["marked_at"]

    for c in collapsed.values():
        c["domain"] = ", ".join(sorted(c["all_domains"]))
        del c["all_domains"]

    report_rows = list(collapsed.values())

    # Build dataframe — empty if no rows
    if report_rows:
        df = pd.DataFrame(report_rows)
        df["date"]      = df["date"].astype(str)
        df["marked_at"] = df["marked_at"].astype(str)
    else:
        df = pd.DataFrame(columns=["name", "email", "role", "domain", "date", "status", "marked_at"])

    if fmt == "xlsx":
        buf = io.BytesIO()
        df.to_excel(buf, index=False)
        buf.seek(0)
        return send_file(buf,
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                         as_attachment=True, download_name="attendance_report.xlsx")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter)
    data = [list(df.columns)] + [list(map(str, row)) for row in df.values.tolist()]
    table = Table(data if len(data) > 1 else [list(df.columns), ["-"] * len(df.columns)])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.whitesmoke),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.black),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
    ]))
    doc.build([table])
    buf.seek(0)
    return send_file(buf, mimetype="application/pdf",
                     as_attachment=True, download_name="attendance_report.pdf")

# ── Faculty: All Users Attendance Details ────────────────────────
@analytics_bp.route("/all-users-attendance", methods=["GET"])
@login_required
def all_users_attendance():
    """Faculty and Admin: see attendance of ALL users of ALL roles."""
    close_expired_sessions_and_mark_absent()
    if request.role not in ("admin", "faculty"):
        return jsonify({"error": "Access denied"}), 403

    args = request.args

    # Get all users of all roles
    users = execute_query(
        """SELECT id, name, email, role, department, year, regno FROM users ORDER BY role, name""",
        fetch=True
    )

    # Build filter conditions for attendance
    conditions = ["1=1"]
    params = []
    if args.get("domain_id"):
        conditions.append("a.domain_id=%s")
        params.append(args["domain_id"])
    if args.get("start_date"):
        conditions.append("a.date >= %s")
        params.append(args["start_date"])
    if args.get("end_date"):
        conditions.append("a.date <= %s")
        params.append(args["end_date"])
    if args.get("week"):
        conditions.append("WEEK(a.date, 1)=%s")
        params.append(args["week"])
    if args.get("month"):
        conditions.append("MONTH(a.date)=%s")
        params.append(args["month"])
    if args.get("year"):
        conditions.append("YEAR(a.date)=%s")
        params.append(args["year"])
    where = " AND ".join(conditions)

    result = []
    for u in users:
        # Get attendance for this user
        att = execute_query(
            f"""SELECT MIN(a.id) as id,
                       GROUP_CONCAT(d.name ORDER BY d.name SEPARATOR ', ') as domain,
                       a.date,
                       CASE WHEN SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) > 0 THEN 'present' ELSE 'absent' END as status,
                       MAX(a.marked_at) as marked_at
               FROM attendance a
               JOIN domains d ON a.domain_id=d.id
               WHERE a.user_id=%s AND {where}
               GROUP BY a.date
               ORDER BY a.date DESC""",
            (u["id"], *params), fetch=True
        )
        
        # Convert date and marked_at to strings since GROUP_CONCAT/aggregations might output datetime or bytearray objects
        for r in att:
            if r.get("date"):
                r["date"] = str(r["date"])
            if r.get("marked_at"):
                r["marked_at"] = str(r["marked_at"])

        total = len(att)
        present = sum(1 for r in att if r["status"] == "present")
        result.append({
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "department": u["department"] or "-",
            "year": u["year"] or "-",
            "regno": u["regno"] or "-",
            "total": total,
            "present": present,
            "absent": total - present,
            "percentage": round((present / total * 100), 1) if total else 0,
            "records": att
        })

    return jsonify(result)
