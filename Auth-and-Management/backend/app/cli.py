"""
Flask CLI commands for database seeding and admin management.
Usage:
    flask seed-db            # Seed roles and domains
    flask create-admin <email>  # Grant admin role to a user
"""
import click
from flask import Flask


def register_commands(app: Flask) -> None:

    @app.cli.command("seed-db")
    def seed_db():
        """Seed the database with initial roles and domains."""
        from .extensions import db
        from .models.user import Role, Domain

        # ── Roles ─────────────────────────────────────────────────────────────
        role_defs = [
            {"name": "admin",       "description": "Full system access"},
            {"name": "domain_lead", "description": "Domain leadership and member management"},
            {"name": "club_member", "description": "Regular club member (default)"},
        ]
        for r in role_defs:
            if not Role.query.filter_by(name=r["name"]).first():
                db.session.add(Role(**r))
                click.echo(f"  ✔  Created role:   {r['name']}")
            else:
                click.echo(f"  –  Role exists:    {r['name']}")

        # ── Domains ───────────────────────────────────────────────────────────
        domain_defs = [
            {"name": "Web Development",      "slug": "web-dev",      "description": "Frontend & Backend Development",    "icon": "🌐"},
            {"name": "Artificial Intelligence", "slug": "ai",        "description": "Artificial Intelligence",           "icon": "🤖"},
            {"name": "Data Analytics",        "slug": "data-analytics", "description": "Data Analysis & Visualization",  "icon": "📊"},
            {"name": "Media",                 "slug": "media",        "description": "Media & Content Creation",         "icon": "📸"},
            {"name": "PR",                    "slug": "pr",           "description": "Public Relations & Management",    "icon": "📢"},
            {"name": "Design",                "slug": "design",       "description": "UI/UX & Graphic Design",           "icon": "🎨"},
            {"name": "Cybersecurity",         "slug": "cybersecurity","description": "Security Research & Ethical Hacking","icon": "🔒"},
            {"name": "Mobile Development",    "slug": "mobile-dev",   "description": "iOS & Android Development",         "icon": "📱"},
            {"name": "Cloud & DevOps",        "slug": "cloud-devops", "description": "Cloud Infrastructure & CI/CD",      "icon": "☁️"},
            {"name": "Blockchain",            "slug": "blockchain",   "description": "Web3 & Distributed Systems",        "icon": "⛓️"},
            {"name": "Game Development",      "slug": "game-dev",     "description": "Unity, Godot & Game Design",        "icon": "🎮"},
            {"name": "Robotics & IoT",        "slug": "robotics-iot", "description": "Embedded Systems & Automation",     "icon": "🤖"},
        ]
        for d in domain_defs:
            if not Domain.query.filter_by(slug=d["slug"]).first():
                db.session.add(Domain(**d))
                click.echo(f"  ✔  Created domain:  {d['name']}")
            else:
                click.echo(f"  –  Domain exists:   {d['name']}")

        db.session.commit()
        click.echo("\n✅  Database seeded successfully!")

    # ──────────────────────────────────────────────────────────────────────────

    @app.cli.command("create-admin")
    @click.argument("email")
    def create_admin(email: str):
        """Grant admin role to a user by their email address."""
        from .extensions import db
        from .models.user import User, Role

        user = User.query.filter_by(email=email).first()
        if not user:
            click.echo(f"❌  No user found with email: {email}")
            return

        admin_role = Role.query.filter_by(name="admin").first()
        if not admin_role:
            click.echo("❌  Admin role not found — run `flask seed-db` first.")
            return

        if admin_role in user.roles:
            click.echo(f"ℹ️   {email} is already an admin.")
            return

        user.roles.append(admin_role)
        db.session.commit()
        click.echo(f"✅  Admin role granted to {email}")
