# Guía de Migración Supabase - Mi Club

Esta carpeta contiene los scripts necesarios para migrar datos del proyecto antiguo al nuevo.

## 📋 Requisitos previos

1. **Service Role Keys**: Necesitas las claves de servicio de ambos proyectos
   - Ve a Settings > API en cada proyecto Supabase
   - Copia la `service_role` key (no la anon key)

2. **Node.js**: Ya instalado en tu sistema

3. **Herramientas adicionales**:
   - Para usuarios: `curl` y `jq` (instala con `npm install -g jq`)

## 🔄 Pasos de migración

### 1. Exportar usuarios del proyecto antiguo

```bash
# Edita export-users.sh y configura las variables SUPABASE_OLD_* y SUPABASE_NEW_*
# Ejecuta:
./supabase/export-users.sh
```

Esto crea `users_export.json` con todos los usuarios.

### 2. Importar usuarios en el proyecto nuevo

```bash
# Ejecuta después del paso 1:
./supabase/import-users.sh
```

**⚠️ Importante**: Las contraseñas se resetean a `temporal123`. Los usuarios deberán cambiarlas.

### 3. Migrar Storage (buckets y archivos)

```bash
# Instala dependencias:
npm install @supabase/supabase-js fs-extra

# Edita migrate-storage.js con tus claves
# Ejecuta:
node supabase/migrate-storage.js
```

## 📁 Archivos incluidos

- `export-users.sh` - Exporta usuarios del proyecto antiguo
- `import-users.sh` - Importa usuarios en el proyecto nuevo
- `migrate-storage.js` - Copia buckets y archivos de Storage
- `migration-data.sql` - SQL para crear tablas y migrar datos

## 🔐 Seguridad

- Nunca compartas las `service_role` keys
- Estas claves tienen acceso total a tu proyecto
- Úsalas solo para migración y bórralas después

## 🆘 Solución de problemas

- **Error de permisos**: Verifica que las service keys sean correctas
- **Rate limits**: Los scripts incluyen pausas para evitar límites
- **Archivos grandes**: El script de storage maneja archivos de cualquier tamaño

## ✅ Verificación

Después de la migración, verifica:
- Usuarios en Authentication > Users
- Buckets en Storage
- Datos en Table Editor