from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, UniqueConstraint, ForeignKey
from app.db.session import Base


def now():
    return datetime.now(timezone.utc)


class LabItem(Base):
    __tablename__ = 'lab_items'
    __table_args__ = (UniqueConstraint('kind', 'name_key'),)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    kind = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)
    name_key = Column(String(100), nullable=False)
    archived = Column(Boolean, default=False, nullable=False)
    builtin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class LabVersion(Base):
    __tablename__ = 'lab_versions'
    __table_args__ = (UniqueConstraint('item_id', 'number'),)
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id = Column(String(36), ForeignKey('lab_items.id'), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    config_hash = Column(String(64), nullable=False)
    spec = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class LabRun(Base):
    __tablename__ = 'lab_runs'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(100), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default='queued')
    snapshot = Column(JSON, nullable=False)
    result = Column(JSON)
    error = Column(String(300))
    progress = Column(Integer, default=0, nullable=False)
    cancel_requested = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class LabAudit(Base):
    __tablename__ = 'lab_audit'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id = Column(String(36), nullable=False, index=True)
    action = Column(String(40), nullable=False)
    config_hash = Column(String(64))
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
