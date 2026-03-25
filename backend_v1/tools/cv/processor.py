import pdfplumber
from typing import Optional

def extract_text_from_pdf(file_path: str) -> Optional[str]:
    """
    Extracts text from a PDF file using pdfplumber.
    """
    try:
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text.strip()
    except Exception as e:
        print(f"Failed to extract PDF text: {e}")
        return None
