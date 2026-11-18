"""Single source of truth for which engine features are live. The frontend reads this to render honest
"not enabled yet" states instead of pretending a feature works. Flip a flag only when the feature ships."""

FEATURES: dict[str, dict] = {
    "auth": {"enabled": True, "phase": 1, "label": "Authentication & RBAC"},
    "source_registry": {"enabled": True, "phase": 1, "label": "Source registry"},
    "audit_log": {"enabled": True, "phase": 1, "label": "Audit log"},
    "keyword_document_search": {"enabled": True, "phase": 1, "label": "Document keyword search (Postgres FTS)"},
    "ingestion_worker": {"enabled": False, "phase": 2, "label": "Crawling & ingestion worker"},
    "youtube_ingestion": {"enabled": False, "phase": 2, "label": "YouTube transcript ingestion"},
    "pdf_ingestion": {"enabled": False, "phase": 2, "label": "PDF & OCR ingestion"},
    "embeddings": {"enabled": False, "phase": 3, "label": "Chunking & embeddings"},
    "hybrid_retrieval": {"enabled": False, "phase": 3, "label": "Hybrid retrieval (dense + BM25 + RRF + rerank)"},
    "chat_answers": {"enabled": False, "phase": 4, "label": "Evidence-grounded answers"},
    "query_classification": {"enabled": False, "phase": 4, "label": "Query classification & routing"},
    "sql_analytics": {"enabled": False, "phase": 4, "label": "SQL analytics lane"},
    "evaluation_runs": {"enabled": False, "phase": 6, "label": "Benchmark & evaluation runs"},
}


def capabilities() -> dict:
    return {"features": {k: dict(v) for k, v in FEATURES.items()}}


def is_enabled(feature: str) -> bool:
    return bool(FEATURES.get(feature, {}).get("enabled"))
