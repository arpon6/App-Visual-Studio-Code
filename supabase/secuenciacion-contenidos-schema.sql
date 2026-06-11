-- Tabla de contenidos (biblioteca de contenidos que se pueden usar en entrenamientos)
CREATE TABLE IF NOT EXISTS contenidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de secuenciación: qué contenidos se trabajan en qué entrenamientos
CREATE TABLE IF NOT EXISTS secuenciacion_contenidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  contenidos TEXT[] NOT NULL, -- Array de contenidos (mezcla de IDs de tabla y textos personalizados)
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fecha)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_secuenciacion_fecha ON secuenciacion_contenidos(fecha);

-- RLS (Row Level Security) - Opcional: ajustar según tu configuración de permisos
ALTER TABLE contenidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE secuenciacion_contenidos ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad (opcional - permitir lectura a todos autenticados, escribir solo a staff)
CREATE POLICY "Leer contenidos" ON contenidos FOR SELECT USING (true);
CREATE POLICY "Crear contenidos" ON contenidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Actualizar contenidos" ON contenidos FOR UPDATE USING (true);
CREATE POLICY "Eliminar contenidos" ON contenidos FOR DELETE USING (true);

CREATE POLICY "Leer secuenciacion" ON secuenciacion_contenidos FOR SELECT USING (true);
CREATE POLICY "Crear secuenciacion" ON secuenciacion_contenidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Actualizar secuenciacion" ON secuenciacion_contenidos FOR UPDATE USING (true);
CREATE POLICY "Eliminar secuenciacion" ON secuenciacion_contenidos FOR DELETE USING (true);
