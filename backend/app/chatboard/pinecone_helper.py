from pinecone import Pinecone
from app.config import settings

pc = Pinecone(api_key=settings.PINECONE_API_KEY)

def get_index():
    if settings.PINECONE_INDEX not in pc.list_indexes().names():
        pc.create_index_for_model(
            name=settings.PINECONE_INDEX,
            cloud="aws",
            region="us-east-1",
            embed={
                "model": "llama-text-embed-v2",
                "field_map": {"text": "text"}
            }
        )
    return pc.Index(settings.PINECONE_INDEX)

def store_file_chunks(file_id: str, content: str):
    index   = get_index()
    lines   = content.splitlines()
    records = []

    for i in range(0, len(lines), 30):
        chunk_text = "\n".join(lines[i:i+30])
        if not chunk_text.strip():
            continue
        records.append({
            "_id":     f"{file_id}_chunk_{i}",
            "text":    chunk_text,
            "file_id": file_id
        })

    if records:
        index.upsert_records(namespace="__default__", records=records)

def search_file(file_id: str, question: str, top_k: int = 3):
    index   = get_index()
    results = index.search(
        namespace="__default__",
        query={
            "inputs": {"text": question},
            "top_k": top_k,
            "filter": {"file_id": file_id}
        }
    )
    return [hit["fields"]["text"] for hit in results["result"]["hits"]]

def delete_file_chunks(file_id: str):
    index = get_index()
    index.delete(filter={"file_id": {"$eq": file_id}}, namespace="__default__")