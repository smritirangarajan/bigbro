import chromadb
import os
from dotenv import load_dotenv
import time

load_dotenv()

class ChromaDBClient:
    def __init__(self):
        api_key = os.getenv('CHROMADB_API_KEY')
        tenant = os.getenv('CHROMADB_TENANT')
        database = os.getenv('CHROMADB_DATABASE')
        
        if not api_key or not tenant or not database:
            raise ValueError("Missing ChromaDB credentials in .env file")
        
        self.client = chromadb.CloudClient(
            api_key=api_key,
            tenant=tenant,
            database=database
        )
        
        self.collection = self.client.get_or_create_collection(
            name="reading_content",
            metadata={"description": "Content read by the user for quiz generation"}
        )
        
    def add_content(self, content, url, title):
        """Add content to ChromaDB"""
        import uuid
        doc_id = str(uuid.uuid4())
        
        self.collection.add(
            documents=[content],
            metadatas=[{
                "url": url,
                "title": title,
                "timestamp": str(int(time.time()))
            }],
            ids=[doc_id]
        )
        
    def get_recent_content(self, limit=10):
        """Get recent content from ChromaDB"""
        results = self.collection.get(limit=limit)
        return results
    
    def search_similar_content(self, query, n_results=5):
        """Search for similar content"""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        return results
    
    def clear_collection(self):
        """Clear all content from collection"""
        self.collection.delete()

_chromadb_client = None

def get_chromadb_client():
    global _chromadb_client
    if _chromadb_client is None:
        _chromadb_client = ChromaDBClient()
    return _chromadb_client
