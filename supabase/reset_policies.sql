-- Asegurar que RLS esté activo
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes para empezar de cero
DROP POLICY IF EXISTS "Acceso total para autenticados" ON calendar_events;
DROP POLICY IF EXISTS "Autenticados pueden ver eventos" ON calendar_events;
DROP POLICY IF EXISTS "Autenticados pueden insertar eventos" ON calendar_events;
DROP POLICY IF EXISTS "Autenticados pueden actualizar sus eventos" ON calendar_events;
DROP POLICY IF EXISTS "Autenticados pueden borrar eventos" ON calendar_events;

-- Crear políticas granulares
CREATE POLICY "Permitir lectura autenticados" ON calendar_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir insertar autenticados" ON calendar_events FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Permitir actualizar autenticados" ON calendar_events FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir borrar autenticados" ON calendar_events FOR DELETE USING (auth.role() = 'authenticated');
