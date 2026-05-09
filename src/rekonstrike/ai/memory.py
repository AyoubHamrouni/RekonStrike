import logging
from typing import List, Optional, Dict, Any
import json

from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from langchain_core.documents import Document
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..database import AIVectorMemory

logger = logging.getLogger(__name__)

class MemoryService:
    """Service for managing Long-Term Memory (LTM) using vector embeddings."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            api_key=settings.ai_api_keys.get("openai")
        )
        # The connection string for langchain-postgres needs to be synchronous for now
        # because PGVector in langchain-postgres often uses psycopg2/psycopg under the hood
        # unless configured for async.
        self.connection_string = settings.db_url.replace("postgresql+asyncpg://", "postgresql://")
        
        self.vector_store = PGVector(
            embeddings=self.embeddings,
            collection_name="ai_memory",
            connection=self.connection_string,
            use_jsonb=True,
        )

    async def add_memory(
        self, 
        content: str, 
        memory_type: str, 
        target_id: Optional[int] = None, 
        session_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Adds a new memory to the vector store."""
        doc = Document(
            page_content=content,
            metadata={
                "memory_type": memory_type,
                "target_id": target_id,
                "session_id": session_id,
                **(metadata or {})
            }
        )
        try:
            # PGVector.aadd_documents is available in newer versions
            await self.vector_store.aadd_documents([doc])
            logger.info(f"Added {memory_type} memory to LTM")
        except Exception as e:
            logger.error(f"Failed to add memory: {e}")

    async def search_similar(
        self, 
        query: str, 
        limit: int = 5, 
        memory_type: Optional[str] = None,
        target_id: Optional[int] = None
    ) -> List[Document]:
        """Searches for similar memories in the vector store."""
        filter_dict = {}
        if memory_type:
            filter_dict["memory_type"] = memory_type
        if target_id:
            filter_dict["target_id"] = target_id
            
        try:
            results = await self.vector_store.asimilarity_search(
                query, 
                k=limit,
                filter=filter_dict if filter_dict else None
            )
            return results
        except Exception as e:
            logger.error(f"Failed to search memory: {e}")
            return []

    async def get_triage_context(self, finding_summary: str) -> str:
        """Retrieves past triage decisions to provide context for the current triage agent."""
        similar = await self.search_similar(finding_summary, limit=3, memory_type="triage_decision")
        if not similar:
            return "No similar past findings found."
            
        context = "Historical Triage Context:\n"
        for doc in similar:
            verdict = doc.metadata.get("verdict", "Unknown")
            note = doc.metadata.get("triage_note", "N/A")
            context += f"- Past Finding: {doc.page_content}\n  Verdict: {verdict}\n  Note: {note}\n"
        return context
