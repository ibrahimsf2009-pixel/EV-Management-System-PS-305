CREATE TABLE public.gridpulse_demo_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  grid_capacity NUMERIC NOT NULL DEFAULT 50,
  building_demand NUMERIC NOT NULL DEFAULT 17,
  solar_generation NUMERIC NOT NULL DEFAULT 17,
  vehicles JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gridpulse_singleton CHECK (id = 'main')
);

GRANT SELECT, INSERT, UPDATE ON public.gridpulse_demo_state TO anon;
GRANT SELECT, INSERT, UPDATE ON public.gridpulse_demo_state TO authenticated;
GRANT ALL ON public.gridpulse_demo_state TO service_role;

ALTER TABLE public.gridpulse_demo_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public demo state is readable"
ON public.gridpulse_demo_state
FOR SELECT
TO anon, authenticated
USING (id = 'main');

CREATE POLICY "Public demo state can be created"
ON public.gridpulse_demo_state
FOR INSERT
TO anon, authenticated
WITH CHECK (id = 'main');

CREATE POLICY "Public demo state can be updated"
ON public.gridpulse_demo_state
FOR UPDATE
TO anon, authenticated
USING (id = 'main')
WITH CHECK (id = 'main');