import chromadb
from chromadb.utils import embedding_functions
import os
from ..core.llm import settings

class RAGManager:
    def __init__(self, collection_name: str = "user_cv"):
        # Initialize persistent client
        self.client = chromadb.PersistentClient(path="./chroma_db")
        
        # Use Google Generative AI embeddings
        self.embedding_fn = embedding_functions.GoogleGenerativeAiEmbeddingFunction(
            api_key=settings.GOOGLE_API_KEY
        )
        
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_fn
        )

    def add_document(self, text: str, doc_id: str, metadata: dict = None):
        """
        Fragments text and adds it to the vector database.
        """
        # Simple fragmentation by paragraphs or chunks
        chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
        
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
        metadatas = [metadata or {} for _ in range(len(chunks))]
        
        self.collection.add(
            documents=chunks,
            ids=ids,
            metadatas=metadatas
        )

    def query(self, query_text: str, n_results: int = 5):
        """
        Queries the vector database for relevant fragments.
        """
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        return results["documents"][0] if results["documents"] else []

    def get_user_profile_summary(self) -> str:
        """
        Returns a summary of the user profile based on all documents in the collection.
        This is useful for pre-filtering jobs based on the candidate's stack.
        """
        results = self.collection.get()
        if not results["documents"]:
            return "No profile data found."
        
        # Combine all fragments to get a full view
        all_text = "\n".join(results["documents"])
        # We only need a portion to avoid context blowup, but enough to know the stack
        return all_text[:2000] 

rag_manager = RAGManager()
