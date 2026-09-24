-- ==============================================================================
-- ATUALIZAÇÃO DO ESQUEMA SQL: ADIÇÃO DA COLUNA 'lote'
-- Executar no SQL Editor do Supabase para adicionar a coluna na tabela geral_cnhs
-- ==============================================================================

-- 1. Adicionar a nova coluna 'lote' na tabela public.geral_cnhs (se não existir)
ALTER TABLE public.geral_cnhs
ADD COLUMN IF NOT EXISTS lote VARCHAR(100);

-- 2. Criar índice para acelerar consultas e filtros por lote
CREATE INDEX IF NOT EXISTS idx_geral_cnhs_lote ON public.geral_cnhs(lote);

-- 3. Notificação e recarregamento de schema cache no Supabase
NOTIFY pgrst, 'reload schema';
