from pydantic import BaseModel
from typing import Optional

class CreateProjectSchema(BaseModel):
    name: str
    description: Optional[str] = ""

class UpdateProjectSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None