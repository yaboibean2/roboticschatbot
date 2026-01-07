-- Add chunk_count column to track processing status
ALTER TABLE public.manuals 
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';