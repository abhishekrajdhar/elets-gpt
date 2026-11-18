"""UI-review sample data. Everything here is FICTIONAL and labelled: is_sample = true, titles prefixed with
[SAMPLE], URLs under the reserved `.invalid` TLD (RFC 2606), and fictional organisations. It is never
presented as Elets content and can be removed with `purge-sample`."""

import hashlib
import re
from datetime import UTC, date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Chunk, Document, DocumentEntity, Entity, Source
from app.models.enums import (
    AccessLevel,
    DocType,
    EntityRole,
    EntityType,
    SourceType,
    Vertical,
)

SAMPLE_SLUG = "sample-data"

DOCS = [
    dict(title="Example State rolls out unified citizen services portal", vertical="egov", doc_type="article",
         published="2026-03-14", author="Sample Desk", category="Digital Governance",
         orgs=["Example State IT Department"], people=[("Asha Verma", "Secretary, Example State IT")],
         topics=["citizen services", "digital public infrastructure"], access="public",
         body=("The Example State IT Department launched a unified portal that consolidates 120 citizen services "
               "into a single sign-on experience.\n\nOfficials said the portal reduced average application time "
               "from nine days to three days during the pilot.\n\nThe next phase will integrate grievance "
               "redressal and real-time application tracking.")),
    dict(title="Sample Bank pilots AI-driven fraud monitoring", vertical="bfsi", doc_type="article",
         published="2026-05-02", author="Sample Desk", category="Banking Technology",
         orgs=["Sample Bank Ltd"], people=[("Rohan Iyer", "Chief Risk Officer, Sample Bank Ltd")],
         topics=["fraud detection", "artificial intelligence"], access="public",
         body=("Sample Bank Ltd has begun piloting a machine-learning system that scores card transactions "
               "for fraud risk in under 50 milliseconds.\n\nThe bank reports a 22 percent reduction in false "
               "positives compared with its previous rules engine.\n\nRegulatory reporting remains manual "
               "during the pilot.")),
    dict(title="Digital classrooms reach 4,000 schools in Example District", vertical="digital_learning",
         doc_type="article", published="2025-11-20", author="Sample Desk", category="School Education",
         orgs=["Example District Education Office"], people=[("Meera Nair", "District Education Officer")],
         topics=["smart classrooms", "teacher training"], access="public",
         body=("The Example District Education Office has equipped 4,000 government schools with digital "
               "classrooms.\n\nTeacher training sessions were held in three phases to support adoption.\n\n"
               "Attendance data shows a modest improvement in the first two terms.")),
    dict(title="Sample Health Mission expands telemedicine to rural clinics", vertical="healthcare",
         doc_type="article", published="2026-01-09", author="Sample Desk", category="Health IT",
         orgs=["Sample Health Mission"], people=[("Dr. Kabir Rao", "Mission Director")],
         topics=["telemedicine", "rural health"], access="public",
         body=("Sample Health Mission connected 600 rural clinics to a telemedicine network.\n\nSpecialist "
               "consultations are now available within 48 hours for most districts.\n\nConnectivity gaps "
               "remain in hilly regions.")),
    dict(title="Sample Governance Summit 2026: key takeaways", vertical="events", doc_type="event_page",
         published="2026-08-28", author="Sample Events Team", category="Conference",
         event=("Sample Governance Summit 2026", "2026-08-27"),
         orgs=["Example State IT Department", "Sample Bank Ltd"],
         people=[("Asha Verma", "Secretary, Example State IT"), ("Rohan Iyer", "Chief Risk Officer")],
         topics=["digital public infrastructure", "cybersecurity"], access="public",
         body=("The Sample Governance Summit 2026 brought together 300 delegates from government and "
               "industry.\n\nPanels focused on interoperable digital public infrastructure and cybersecurity "
               "readiness.\n\nSpeakers called for shared standards for data exchange between departments.")),
    dict(title="Sample Magazine — September 2026 issue", vertical="magazine", doc_type="magazine_issue",
         published="2026-09-01", author="Sample Editorial", category="Magazine",
         orgs=["Sample Health Mission"], people=[], topics=["telemedicine"], access="public", pages=3,
         body=("Page 1. Cover story: building resilient public health systems.\n\nPage 2. Interview with the "
               "director of Sample Health Mission on telemedicine scale-up.\n\nPage 3. Data: 600 clinics "
               "connected; median consultation wait time 36 hours.")),
    dict(title="Sample Bank Q2 technology briefing (internal)", vertical="bfsi", doc_type="article",
         published="2026-07-15", author="Sample Desk", category="Internal Briefing",
         orgs=["Sample Bank Ltd"], people=[], topics=["core banking"], access="internal",
         body=("This internal sample briefing summarises Sample Bank's core banking migration timeline.\n\n"
               "It is marked internal to demonstrate permission-aware retrieval: viewers cannot see it.")),
    dict(title="Video: Panel on digital public infrastructure", vertical="general", doc_type="video",
         published="2026-09-05", author=None, category="Video", video=("SAMPLEVID01", 1260),
         orgs=["Example State IT Department"], people=[("Asha Verma", "Secretary, Example State IT")],
         topics=["digital public infrastructure"], access="public",
         body=("Welcome to the panel on digital public infrastructure.\n\nOur first speaker describes the "
               "unified citizen services portal and its single sign-on design.\n\nThe discussion closes with "
               "questions about data protection.")),
]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _hash(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _entity(db: Session, etype: EntityType, name: str, cache: dict) -> Entity:
    key = (etype, _norm(name))
    if key in cache:
        return cache[key]
    ent = db.scalar(select(Entity).where(Entity.entity_type == etype, Entity.normalized_name == key[1]))
    if not ent:
        ent = Entity(entity_type=etype, name=name, normalized_name=key[1], attributes={"sample": True})
        db.add(ent)
        db.flush()
    cache[key] = ent
    return ent


def seed(db: Session) -> int:
    if db.scalar(select(Source).where(Source.slug == SAMPLE_SLUG)):
        purge(db)
    src = Source(name="Sample data (UI review only)", slug=SAMPLE_SLUG, source_type=SourceType.website,
                 base_url="https://sample.invalid/", vertical=Vertical.general, enabled=False,
                 description="Fictional, clearly-labelled data for reviewing the UI. Not Elets content.",
                 crawl_config={"respect_robots": True, "discovery": []})
    db.add(src)
    db.flush()
    cache: dict = {}
    for i, d in enumerate(DOCS):
        slug = re.sub(r"[^a-z0-9]+", "-", d["title"].lower()).strip("-")[:80]
        url = f"https://sample.invalid/{d['vertical']}/{slug}"
        body = d["body"]
        doc = Document(
            source_id=src.id, doc_type=DocType(d["doc_type"]), external_id=f"sample-{i}",
            title=f"[SAMPLE] {d['title']}", url=url, canonical_url=url, author=d.get("author"),
            category=d.get("category"), tags=d["topics"], language="en", vertical=Vertical(d["vertical"]),
            published_at=datetime.fromisoformat(d["published"]).replace(tzinfo=UTC),
            summary=body.split("\n\n")[0], content_text=body, content_hash=_hash(body),
            word_count=len(body.split()), access_level=AccessLevel(d["access"]), is_sample=True,
            page_count=d.get("pages"), metadata_={"sample": True, "extraction_method": "sample_fixture"},
        )
        if "event" in d:
            doc.event_name, ev_date = d["event"]
            doc.event_date = date.fromisoformat(ev_date)
        if "video" in d:
            doc.video_id, doc.duration_seconds = d["video"]
            doc.channel_name = "Sample Channel"
        db.add(doc)
        db.flush()

        pos = 0
        first_chunk = None
        for idx, para in enumerate(body.split("\n\n")):
            start = body.index(para, pos)
            pos = start + len(para)
            ch = Chunk(document_id=doc.id, document_version=1, chunk_index=idx, text=para,
                       context_prefix=doc.title, token_count=len(para.split()), char_start=start, char_end=pos,
                       content_hash=_hash(para), metadata_={"sample": True})
            if d["doc_type"] == "magazine_issue":
                ch.page_number = idx + 1
            if d["doc_type"] == "video":
                ch.timestamp_start, ch.timestamp_end = idx * 420.0, (idx + 1) * 420.0
            db.add(ch)
            db.flush()
            first_chunk = first_chunk or ch

        links: dict[tuple, DocumentEntity] = {}

        def link(ent: Entity, role: EntityRole, designation: str | None = None):
            k = (ent.id, role)
            if k not in links:
                links[k] = DocumentEntity(document_id=doc.id, entity_id=ent.id, role=role,
                                          designation=designation, first_chunk_id=first_chunk.id)
                db.add(links[k])

        for org in d["orgs"]:
            link(_entity(db, EntityType.organisation, org, cache), EntityRole.subject)
        for person, desig in d["people"]:
            role = EntityRole.speaker if d["doc_type"] in ("event_page", "video") else EntityRole.mentioned
            link(_entity(db, EntityType.person, person, cache), role, desig)
        for topic in d["topics"]:
            link(_entity(db, EntityType.topic, topic, cache), EntityRole.subject)
        if "event" in d:
            link(_entity(db, EntityType.event, d["event"][0], cache), EntityRole.subject)
    db.commit()
    return len(DOCS)


def purge(db: Session) -> int:
    ids = db.scalars(select(Document.id).where(Document.is_sample)).all()
    if ids:
        db.execute(delete(Document).where(Document.id.in_(ids)))
    db.execute(delete(Source).where(Source.slug == SAMPLE_SLUG))
    # Remove entities that only existed for sample data and are now unreferenced.
    orphan = select(DocumentEntity.entity_id).where(DocumentEntity.entity_id == Entity.id).exists()
    db.execute(delete(Entity).where(Entity.attributes["sample"].as_boolean().is_(True), ~orphan))
    db.commit()
    return len(ids)
