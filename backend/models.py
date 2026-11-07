from typing import Literal

from sqlalchemy import Column, Integer, String, JSON
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel, model_validator

Base = declarative_base()


class Database(Base):
    __tablename__ = "databases"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    file_path = Column(String, nullable=True)
    text_content = Column(String, nullable=True)


class Classification(Base):
    __tablename__ = "classifications"
    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, nullable=False)
    database_id = Column(Integer, nullable=False)
    classifier_method = Column(String, nullable=False, default="dictionary")
    result = Column(JSON, nullable=False)


class DocumentCreate(BaseModel):
    text: str | None = None


class ClassifyRequest(BaseModel):
    document_id: int
    database_id: int | None = None
    force_recompute: bool = False
    method: Literal["dictionary", "structural", "ml"] = "dictionary"

    @model_validator(mode="after")
    def validate_method_and_db(self):
        if self.method in {"dictionary", "structural"}:
            if self.database_id is None or self.database_id <= 0:
                raise ValueError("Для выбранного метода укажите положительный database_id эталона")
            return self
        return self.model_copy(update={"database_id": -1})
