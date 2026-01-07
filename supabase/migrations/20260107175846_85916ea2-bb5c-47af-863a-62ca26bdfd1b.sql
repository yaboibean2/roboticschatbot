-- Create table for storing PDF manuals metadata
CREATE TABLE public.manuals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on manuals (public read, no user restriction for admin uploads)
ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read manuals
CREATE POLICY "Anyone can view manuals"
  ON public.manuals
  FOR SELECT
  USING (true);

-- Allow anyone to insert/update/delete manuals (admin-only in practice via UI)
CREATE POLICY "Anyone can manage manuals"
  ON public.manuals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add manual_id to document_chunks to link chunks to specific PDFs
ALTER TABLE public.document_chunks
ADD COLUMN manual_id UUID REFERENCES public.manuals(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_document_chunks_manual_id ON public.document_chunks(manual_id);

-- Create storage bucket for PDF files
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuals', 'manuals', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to manuals bucket
CREATE POLICY "Public read access for manuals"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'manuals');

-- Allow anyone to upload to manuals bucket
CREATE POLICY "Anyone can upload manuals"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'manuals');

-- Allow anyone to delete from manuals bucket
CREATE POLICY "Anyone can delete manuals"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'manuals');

-- Update the match_chunks function to filter by manual_id
CREATE OR REPLACE FUNCTION public.match_chunks_by_manual(
  query_embedding vector(1536),
  manual_id_filter UUID,
  match_count INTEGER DEFAULT 8,
  match_threshold FLOAT DEFAULT 0.25
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.metadata::jsonb,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.manual_id = manual_id_filter
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;