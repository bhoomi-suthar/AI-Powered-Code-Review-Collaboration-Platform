from pydantic import BaseModel
from typing import Optional

class FileResponseSchema(BaseModel):
    id: str
    filename: str
    original_name: str
    file_type: str
    size: int
    project_id: str
    uploaded_by_name: str