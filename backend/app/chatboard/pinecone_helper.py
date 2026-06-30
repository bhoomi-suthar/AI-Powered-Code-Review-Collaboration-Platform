from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
from app.config import settings

_model = None

def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

pc = Pinecone(api_key=settings.PINECONE_API_KEY)

def get_index():
    if settings.PINECONE_INDEX not in pc.list_indexes().names():
        pc.create_index(
            name=settings.PINECONE_INDEX,
            dimension=384,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1")
        )
    return pc.Index(settings.PINECONE_INDEX)

def embed(text: str):
    return [0.0] * 384

def store_file_chunks(file_id: str, content: str):
    index  = get_index() 
    lines  = content.splitlines()
    chunks = []

    # Split into chunks of 30 lines
    for i in range(0, len(lines), 30):       
        chunk_text = "\n".join(lines[i:i+30])
        if not chunk_text.strip():
            continue
        chunk_id  = f"{file_id}_chunk_{i}"
        vector    = embed(chunk_text)
        chunks.append({
            "id":     chunk_id,
            "values": vector,
            "metadata": {
                "file_id": file_id,
                "text":    chunk_text
            }
        })

    if chunks:
        index.upsert(vectors=chunks)

def search_file(file_id: str, question: str, top_k: int = 3):
    index   = get_index()
    vector  = embed(question)
    results = index.query(
        vector=vector,
        top_k=top_k,
        filter={"file_id": {"$eq": file_id}},
        include_metadata=True
    )
    return [m.metadata["text"] for m in results.matches]

def delete_file_chunks(file_id: str):
    index = get_index()
    index.delete(filter={"file_id": {"$eq": file_id}})