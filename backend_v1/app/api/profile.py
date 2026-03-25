from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import shutil
import os
from ...tools.cv.processor import extract_text_from_pdf
from ..rag.manager import rag_manager
from ..database import get_session, User
from sqlmodel import Session, select

router = APIRouter(prefix="/profile", tags=["profile"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload-cv")
async def upload_cv(file: UploadFile = File(...), session: Session = Depends(get_session)):
    """
    Uploads a PDF CV, extracts text, and stores it in the RAG system.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract text
    text = extract_text_from_pdf(file_path)
    if not text:
        raise HTTPException(status_code=500, detail="Failed to extract text from CV")
        
    # Store in RAG
    rag_manager.add_document(text, doc_id=file.filename, metadata={"type": "cv"})

    # Optional: Update/Create user profile in relational DB
    # For now, we use a mock user_id or based on file name if no auth
    user_email = "default@user.com"
    user = session.exec(select(User).where(User.email == user_email)).first()
    if not user:
        user = User(email=user_email, full_name="Default User")
        session.add(user)
        session.commit()
    
    return {"message": "CV uploaded and processed successfully", "filename": file.filename}
