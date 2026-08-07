from pydantic import BaseModel
from typing import Generic, TypeVar, Optional, List, Any

# Declare generic type for standard response data
DataType = TypeVar("DataType")

class APIResponse(BaseModel, Generic[DataType]):
    success: bool
    message: str
    data: Optional[DataType] = None
    errors: Optional[List[Any]] = []
