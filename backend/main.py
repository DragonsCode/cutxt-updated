import io
import os
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.responses import StreamingResponse

from models import Database, Document, Classification, ClassifyRequest
from database import get_db
from nlp.classifier import DICTIONARY_VERSION, classify_text
from nlp.structural import STRUCTURAL_VERSION, classify_structural
from nlp.loader import load_database, load_document
from nlp.reference_db import ReferenceDBError
from storage import max_upload_bytes, safe_stored_name, save_upload_file
from ml.service import classify_ml_text, load_ml_bundle, ml_status

os.makedirs("databases", exist_ok=True)
os.makedirs("documents", exist_ok=True)
os.makedirs("models", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_ml_bundle()
    yield


app = FastAPI(lifespan=lifespan)

_cors = os.environ.get("CORS_ORIGINS", "*").strip()
if not _cors:
    _cors = "*"
_origins = [o.strip() for o in _cors.split(",") if o.strip()]
_allow_credentials = "*" not in _origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins else ["*"],
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    st = ml_status()
    return {"status": "ok", "ml_model": {"available": st["available"]}}


@app.get("/ml/status")
def get_ml_status():
    return ml_status()


@app.post("/database")
async def create_database(
    name: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    stored = safe_stored_name(file.filename, (".db", ".sqlite"))
    file_path = os.path.join("databases", stored)
    await save_upload_file(file, file_path, max_upload_bytes())
    db_entry = Database(name=name, file_path=file_path)
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return {"id": db_entry.id, "name": name}


@app.get("/database")
def get_databases(db: Session = Depends(get_db)):
    databases = db.query(Database).all()
    return [{"id": d.id, "name": d.name} for d in databases]


@app.get("/database/{id}")
def get_database(id: int, db: Session = Depends(get_db)):
    db_entry = db.query(Database).filter(Database.id == id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Database not found")
    return FileResponse(
        db_entry.file_path, filename=os.path.basename(db_entry.file_path)
    )


@app.delete("/database/{id}")
def delete_database(id: int, db: Session = Depends(get_db)):
    db_entry = db.query(Database).filter(Database.id == id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Database not found")
    if os.path.exists(db_entry.file_path):
        os.remove(db_entry.file_path)
    db.delete(db_entry)
    db.commit()
    return {"detail": "Database deleted"}


@app.post("/document")
async def create_document(
    name: str = Form(...),
    file: UploadFile = File(None),
    text: str = Form(None),
    db: Session = Depends(get_db),
):
    if not file and not text:
        raise HTTPException(
            status_code=400, detail="Either file or text must be provided"
        )
    if file and text:
        raise HTTPException(
            status_code=400, detail="Provide either file or text, not both"
        )

    file_path = None
    text_content = None

    if file:
        if not file.filename.lower().endswith((".pdf", ".docx")):
            raise HTTPException(
                status_code=400, detail="File must be PDF or DOCX"
            )
        stored = safe_stored_name(file.filename, (".pdf", ".docx"))
        file_path = os.path.join("documents", stored)
        await save_upload_file(file, file_path, max_upload_bytes())
    else:
        text_content = text
        if len(text_content.encode("utf-8")) > max_upload_bytes():
            raise HTTPException(
                status_code=413,
                detail=f"Text too large (max {max_upload_bytes()} bytes)",
            )

    doc_entry = Document(name=name, file_path=file_path, text_content=text_content)
    db.add(doc_entry)
    db.commit()
    db.refresh(doc_entry)
    return {"id": doc_entry.id, "name": name}


@app.get("/document")
def get_documents(db: Session = Depends(get_db)):
    documents = db.query(Document).all()
    return [{"id": d.id, "name": d.name} for d in documents]


@app.get("/document/{id}")
def get_document(id: int, db: Session = Depends(get_db)):
    doc_entry = db.query(Document).filter(Document.id == id).first()
    if not doc_entry:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc_entry.file_path:
        return FileResponse(
            doc_entry.file_path, filename=os.path.basename(doc_entry.file_path)
        )
    filename = f"{doc_entry.name}.txt"
    return StreamingResponse(
        io.StringIO(doc_entry.text_content),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{quote(filename, safe='')}"},
    )


@app.delete("/document/{id}")
def delete_document(id: int, db: Session = Depends(get_db)):
    doc_entry = db.query(Document).filter(Document.id == id).first()
    if not doc_entry:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc_entry.file_path and os.path.exists(doc_entry.file_path):
        os.remove(doc_entry.file_path)
    db.delete(doc_entry)
    db.commit()
    return {"detail": "Document deleted"}


def _load_document_text(doc_entry: Document) -> str:
    if doc_entry.file_path:
        try:
            return load_document(doc_entry.file_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    return doc_entry.text_content


def _find_cached_classification(db: Session, request: ClassifyRequest):
    q = db.query(Classification).filter(
        Classification.document_id == request.document_id,
        Classification.classifier_method == request.method,
    )
    if request.method != "ml":
        q = q.filter(Classification.database_id == request.database_id)
    else:
        q = q.filter(Classification.database_id == -1)
    return q.first()


@app.post("/classify")
def create_classification(request: ClassifyRequest, db: Session = Depends(get_db)):
    existing = _find_cached_classification(db, request)

    versions = {"dictionary": DICTIONARY_VERSION, "structural": STRUCTURAL_VERSION}
    outdated = (existing and request.method in versions
                and existing.result.get("classifier_version") != versions[request.method])
    if existing and not request.force_recompute and not outdated:
        return {
            "classification_id": existing.id,
            "document_id": existing.document_id,
            "database_id": existing.database_id,
            "classifier_method": existing.classifier_method,
            "classification_result": existing.result,
        }

    doc_entry = db.query(Document).filter(Document.id == request.document_id).first()
    if not doc_entry:
        raise HTTPException(status_code=404, detail="Document not found")

    if request.method != "ml":
        db_entry = db.query(Database).filter(Database.id == request.database_id).first()
        if not db_entry:
            raise HTTPException(status_code=404, detail="Database not found")
        try:
            tables_df, keys_df = load_database(db_entry.file_path)
        except ReferenceDBError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        text = _load_document_text(doc_entry)
        try:
            classifier = classify_structural if request.method == "structural" else classify_text
            result = classifier(text, tables_df, keys_df)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    else:
        if not ml_status()["available"]:
            raise HTTPException(
                status_code=503,
                detail=(
                    "ML-модель не загружена. Сохраните обученную transformer-модель в "
                    "models/transformer_classifier или задайте путь через ML_MODEL_PATH."
                ),
            )
        text = _load_document_text(doc_entry)
        try:
            result = classify_ml_text(text)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e

    # Старый результат сохраняется, если пересчёт завершился ошибкой.
    if existing:
        classif = existing
        classif.result = result
    else:
        classif = Classification(
            document_id=request.document_id,
            database_id=request.database_id,
            classifier_method=request.method,
            result=result,
        )
    db.add(classif)
    db.commit()
    db.refresh(classif)

    return {
        "classification_id": classif.id,
        "document_id": classif.document_id,
        "database_id": classif.database_id,
        "classifier_method": classif.classifier_method,
        "classification_result": classif.result,
    }


@app.get("/classify")
def get_classifications(db: Session = Depends(get_db)):
    classifications = db.query(Classification).all()
    return [
        {
            "classification_id": c.id,
            "document_id": c.document_id,
            "database_id": c.database_id,
            "classifier_method": c.classifier_method,
            "classification_result": c.result,
        }
        for c in classifications
    ]


@app.get("/classify/{id}")
def get_classification(id: int, db: Session = Depends(get_db)):
    classif = db.query(Classification).filter(Classification.id == id).first()
    if not classif:
        raise HTTPException(status_code=404, detail="Classification not found")
    return {
        "classification_id": classif.id,
        "document_id": classif.document_id,
        "database_id": classif.database_id,
        "classifier_method": classif.classifier_method,
        "classification_result": classif.result,
    }


@app.delete("/classify/{id}")
def delete_classification(id: int, db: Session = Depends(get_db)):
    classif = db.query(Classification).filter(Classification.id == id).first()
    if not classif:
        raise HTTPException(status_code=404, detail="Classification not found")
    db.delete(classif)
    db.commit()
    return {"detail": "Classification deleted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="localhost", port=8000)
