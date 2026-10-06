from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, UniqueConstraint, ForeignKey
from app.db.session import Base


def now():
    return datetime.now(timezone.utc)


class LabItem(Base):
    __tablename__ = 'lab_items'
    __table_args__ = (UniqueConstraint('kind', 'name_key'),)
    id: Any = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    kind: Any = Column(String(20), nullable=False)
    name: Any = Column(String(100), nullable=False)
    name_key: Any = Column(String(100), nullable=False)
    archived: Any = Column(Boolean, default=False, nullable=False)
    builtin: Any = Column(Boolean, default=False, nullable=False)
    created_at: Any = Column(DateTime(timezone=True), default=now, nullable=False)


class LabVersion(Base):
    __tablename__ = 'lab_versions'
    __table_args__ = (UniqueConstraint('item_id', 'number'),)
    id: Any = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id: Any = Column(String(36), ForeignKey('lab_items.id'), nullable=False, index=True)
    number: Any = Column(Integer, nullable=False)
    config_hash: Any = Column(String(64), nullable=False)
    spec: Any = Column(JSON, nullable=False)
    created_at: Any = Column(DateTime(timezone=True), default=now, nullable=False)


class LabRun(Base):
    __tablename__ = 'lab_runs'
    id: Any = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Any = Column(String(100), nullable=False, unique=True)
    status: Any = Column(String(20), nullable=False, default='queued')
    snapshot: Any = Column(JSON, nullable=False)
    result: Any = Column(JSON)
    error: Any = Column(String(300))
    progress: Any = Column(Integer, default=0, nullable=False)
    cancel_requested: Any = Column(Boolean, default=False, nullable=False)
    created_at: Any = Column(DateTime(timezone=True), default=now, nullable=False)


class LabAudit(Base):
    __tablename__ = 'lab_audit'
    id: Any = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    item_id: Any = Column(String(36), nullable=False, index=True)
    action: Any = Column(String(40), nullable=False)
    config_hash: Any = Column(String(64))
    created_at: Any = Column(DateTime(timezone=True), default=now, nullable=False)
