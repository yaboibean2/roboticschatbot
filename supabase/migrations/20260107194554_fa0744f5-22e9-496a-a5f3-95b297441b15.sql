-- Drop and recreate the match_chunks_by_manual function with proper vector casting
DROP FUNCTION IF EXISTS public.match_chunks_by_manual(extensions.vector, uuid, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_chunks_by_manual(
  query_embedding vector(1536),
  manual_id_filter uuid,
  match_count integer DEFAULT 8,
  match_threshold double precision DEFAULT 0.25
)
RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.metadata::jsonb,
    1 - (dc.embedding::vector(1536) <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.manual_id = manual_id_filter
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding::vector(1536) <=> query_embedding) > match_threshold
  ORDER BY dc.embedding::vector(1536) <=> query_embedding
  LIMIT match_count;
END;
$$;