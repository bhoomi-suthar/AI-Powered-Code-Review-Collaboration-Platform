from pydantic import BaseModel
from typing import Optional

class MessageSchema(BaseModel):
    message: str

class CommentSchema(BaseModel):
    comment: str
    line_number: Optional[int] = None

class ActivitySchema(BaseModel):
    action: str
    details: Optional[str] = ""