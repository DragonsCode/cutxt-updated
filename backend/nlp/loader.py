import pandas as pd
from docx import Document
from docx.text.paragraph import Paragraph
import pdfplumber

from nlp.reference_db import load_database_validated


def load_database(db_path: str):
    return load_database_validated(db_path)


def extract_text_from_docx(file_path: str) -> str:
    doc = Document(file_path)
    # XML-абзацы включают таблицы и не дублируют объединённые ячейки.
    return "\n".join(
        Paragraph(element, doc).text for element in doc.element.body.xpath(".//w:p")
    )


def extract_text_from_pdf(file_path: str) -> str:
    full_text = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                full_text.append(page_text)
    return "\n".join(full_text)


def load_document(file_path: str) -> str:
    if file_path.lower().endswith(".docx"):
        return extract_text_from_docx(file_path)
    elif file_path.lower().endswith(".pdf"):
        return extract_text_from_pdf(file_path)
    else:
        raise ValueError("Unsupported file format. Only .docx and .pdf are supported.")
