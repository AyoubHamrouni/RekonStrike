from pydantic import BaseModel, Field
from typing import Optional, Any


class SubdomainSchema(BaseModel):
    subdomain: str
    source: str
    resolved: bool = False
    ip_address: Optional[str] = None


class LiveHostSchema(BaseModel):
    url: str
    raw_url: Optional[str] = None
    status_code: Optional[int] = None
    title: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)
    content_length: Optional[int] = None
    web_server: Optional[str] = None
    response_headers: dict[str, Any] = Field(default_factory=dict)
    screenshot_path: Optional[str] = None
    roi_score: int = 50
