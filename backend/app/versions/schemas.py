from pydantic import BaseModel
from typing import Optional

class CommitSchema(BaseModel):
    commit_message: str

class RollbackSchema(BaseModel):
    version_id: str