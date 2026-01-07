CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: match_chunks(extensions.vector, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_chunks(query_embedding extensions.vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.3) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


--
-- Name: match_quotes(extensions.vector, integer, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_quotes(query_embedding extensions.vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.5) RETURNS TABLE(id uuid, content text, author text, quote_date date, subject_title text, similarity double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.content,
    q.author,
    q.quote_date,
    q.subject_title,
    1 - (q.embedding <=> query_embedding) AS similarity
  FROM public.quotes q
  WHERE q.embedding IS NOT NULL
    AND 1 - (q.embedding <=> query_embedding) > match_threshold
  ORDER BY q.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


--
-- Name: search_quotes(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_quotes(search_query text, match_count integer DEFAULT 5) RETURNS TABLE(id uuid, content text, author text, quote_date date, subject_title text, relevance real)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    q.id,
    q.content,
    q.author,
    q.quote_date,
    q.subject_title,
    ts_rank(q.search_vector, websearch_to_tsquery('english', search_query)) + 
    similarity(q.content, search_query) AS relevance
  FROM public.quotes q
  WHERE 
    q.search_vector @@ websearch_to_tsquery('english', search_query)
    OR similarity(q.content, search_query) > 0.1
  ORDER BY relevance DESC
  LIMIT match_count;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding extensions.vector(1536),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    author text DEFAULT 'Dugal'::text NOT NULL,
    quote_date date NOT NULL,
    subject_title text NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS ((setweight(to_tsvector('english'::regconfig, COALESCE(subject_title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(content, ''::text)), 'B'::"char"))) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding extensions.vector(1536)
);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: document_chunks_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='100');


--
-- Name: quotes_content_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_content_trgm_idx ON public.quotes USING gin (content public.gin_trgm_ops);


--
-- Name: quotes_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_embedding_idx ON public.quotes USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists='10');


--
-- Name: quotes_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotes_search_idx ON public.quotes USING gin (search_vector);


--
-- Name: document_chunks Document chunks are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Document chunks are publicly readable" ON public.document_chunks FOR SELECT USING (true);


--
-- Name: quotes Quotes are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quotes are publicly readable" ON public.quotes FOR SELECT USING (true);


--
-- Name: document_chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;