-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- 1536 is the dimension for OpenAI text-embedding-3-small
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create an index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS messages_embedding_idx ON messages USING hnsw (embedding vector_cosine_ops);
