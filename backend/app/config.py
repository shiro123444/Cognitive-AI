import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///app.sqlite")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

    # LLM (OpenAI-compatible)
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.xiaomimimo.com/v1")
    LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "mimo-v2.5-pro")

    # Embedding (OpenAI-compatible)
    EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", os.getenv("LLM_BASE_URL", "https://api.xiaomimimo.com/v1"))
    EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", os.getenv("LLM_API_KEY", ""))
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    EMBEDDING_QUERY_INPUT_TYPE = os.getenv("EMBEDDING_QUERY_INPUT_TYPE", "")
    EMBEDDING_PASSAGE_INPUT_TYPE = os.getenv("EMBEDDING_PASSAGE_INPUT_TYPE", "")
    EMBEDDING_TRUNCATE = os.getenv("EMBEDDING_TRUNCATE", "")

    # Vector store
    CHROMADB_DIR = os.getenv("CHROMADB_DIR", os.path.join(os.path.dirname(__file__), "..", "instance", "chromadb"))
