"""Operator CLI.

  uv run python -m app.cli create-admin --email you@example.com --name "Your Name"   (prompts for password)
  uv run python -m app.cli create-admin --from-env       (uses BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD)
  uv run python -m app.cli set-password --email you@example.com   (prompts; signs out other sessions)
  uv run python -m app.cli seed-sample                   (clearly-labelled UI review data; is_sample = true)
  uv run python -m app.cli purge-sample
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.rbac import Role
from app.core.security import hash_password, validate_password_strength
from app.db.session import SessionLocal
from app.models import User
from app.services import sample_data


def create_admin(email: str, name: str, password: str) -> None:
    validate_password_strength(password)
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if existing:
            print(f"User {email} already exists (role={existing.role.value}); nothing changed.")
            return
        db.add(User(email=email.lower(), full_name=name, role=Role.admin, password_hash=hash_password(password)))
        db.commit()
        print(f"Created admin {email}.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ca = sub.add_parser("create-admin")
    ca.add_argument("--email")
    ca.add_argument("--name", default="Administrator")
    ca.add_argument("--from-env", action="store_true")
    sp = sub.add_parser("set-password")
    sp.add_argument("--email", required=True)
    sub.add_parser("seed-sample")
    sub.add_parser("purge-sample")
    args = parser.parse_args(argv)

    if args.cmd == "create-admin":
        if args.from_env:
            s = get_settings()
            if not (s.bootstrap_admin_email and s.bootstrap_admin_password):
                print("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set.", file=sys.stderr)
                return 2
            create_admin(s.bootstrap_admin_email, args.name, s.bootstrap_admin_password)
        else:
            if not args.email:
                print("--email is required (or use --from-env).", file=sys.stderr)
                return 2
            pw = getpass.getpass("Password: ")
            if pw != getpass.getpass("Confirm:  "):
                print("Passwords do not match.", file=sys.stderr)
                return 2
            create_admin(args.email, args.name, pw)
    elif args.cmd == "set-password":
        pw = getpass.getpass("New password: ")
        if pw != getpass.getpass("Confirm:      "):
            print("Passwords do not match.", file=sys.stderr)
            return 2
        try:
            validate_password_strength(pw)
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 2
        with SessionLocal() as db:
            user = db.scalar(select(User).where(func.lower(User.email) == args.email.lower()))
            if not user:
                print(f"No user with email {args.email}.", file=sys.stderr)
                return 2
            user.password_hash = hash_password(pw)
            user.token_version += 1  # sign out existing sessions
            db.commit()
        print(f"Password updated for {args.email}. Sign in at http://localhost:3000")
        with SessionLocal() as db:
            n = sample_data.seed(db)
        print(f"Seeded {n} SAMPLE documents (is_sample = true, URLs under https://sample.invalid/).")
    elif args.cmd == "purge-sample":
        with SessionLocal() as db:
            n = sample_data.purge(db)
        print(f"Removed {n} sample documents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
