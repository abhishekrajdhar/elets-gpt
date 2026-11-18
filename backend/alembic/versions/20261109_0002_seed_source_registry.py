"""Seed the initial Elets source registry (candidates — reachability is verified by Phase 2 probe jobs).

Revision ID: 0002
Revises: 0001
"""

import json
import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WEB_CONFIG = {
    "discovery": ["robots", "sitemap", "rss", "wp_api"],
    "max_pages": 5000,
    "rate_limit_rps": 0.5,
    "respect_robots": True,
    "allowed_paths": [],
    "blocked_paths": ["/wp-admin", "/wp-login.php", "/cart", "/checkout", "/my-account"],
}

SOURCES = [
    ("Elets Online", "eletsonline", "website", "https://eletsonline.com/", "general",
     "Elets Technomedia flagship portal."),
    ("Elets BFSI", "elets-bfsi", "website", "https://bfsi.eletsonline.com/", "bfsi",
     "Banking, financial services and insurance coverage."),
    ("Elets eGov", "elets-egov", "website", "https://egov.eletsonline.com/", "egov",
     "e-Governance and public-sector technology coverage."),
    ("Elets Digital Learning", "elets-digital-learning", "website", "https://digitallearning.eletsonline.com/",
     "digital_learning", "Education and digital learning coverage."),
    ("Elets Events", "elets-events", "website", "https://events.eletsonline.com/", "events",
     "Conferences, summits and award events."),
    ("Elets Magazine", "elets-magazine", "pdf_collection", "https://magazine.eletsonline.com/", "magazine",
     "Magazine issues; PDFs linked from accessible issue pages."),
    ("Elets Videos (YouTube)", "elets-youtube", "youtube_channel", "https://www.youtube.com/@eletsvideos",
     "general", "Requires YOUTUBE_API_KEY. Only publicly accessible caption tracks are used."),
]


def upgrade() -> None:
    conn = op.get_bind()
    for name, slug, stype, url, vertical, desc in SOURCES:
        cfg = dict(WEB_CONFIG)
        if stype == "youtube_channel":
            cfg = {"discovery": ["youtube_api"], "max_videos": 2000, "captions": "public_only",
                   "respect_robots": True, "rate_limit_rps": 1.0}
        elif stype == "pdf_collection":
            cfg = {**WEB_CONFIG, "max_pdf_mb": 50, "ocr": "auto"}
        conn.execute(
            sa.text(
                "INSERT INTO sources (id, name, slug, source_type, base_url, vertical, access_level, enabled, "
                "description, crawl_config, schedule_cron) VALUES (:id, :name, :slug, :stype, :url, :vertical, "
                "'public', true, :desc, CAST(:cfg AS jsonb), :cron) ON CONFLICT (slug) DO NOTHING"
            ),
            {"id": uuid.uuid4(), "name": name, "slug": slug, "stype": stype, "url": url, "vertical": vertical,
             "desc": desc, "cfg": json.dumps(cfg), "cron": "0 2 * * *"},
        )


def downgrade() -> None:
    slugs = [s[1] for s in SOURCES]
    op.get_bind().execute(sa.text("DELETE FROM sources WHERE slug = ANY(:slugs)"), {"slugs": slugs})
