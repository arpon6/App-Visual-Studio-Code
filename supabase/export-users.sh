# Script para exportar usuarios del proyecto antiguo de Supabase
# Reemplaza las variables con tus credenciales reales

# Configuración del proyecto antiguo
export SUPABASE_OLD_URL="https://itvptjbvvipxkvmpkzrr.supabase.co"
export SUPABASE_OLD_SERVICE_ROLE_KEY="tu-service-role-key-del-proyecto-antiguo"

# Configuración del proyecto nuevo
export SUPABASE_NEW_URL="https://seuayvygfqebgxbwsivw.supabase.co"
export SUPABASE_NEW_SERVICE_ROLE_KEY="tu-service-role-key-del-proyecto-nuevo"

# 1. Exportar usuarios del proyecto antiguo
echo "Exportando usuarios del proyecto antiguo..."
curl -X GET "$SUPABASE_OLD_URL/auth/v1/admin/users" \
  -H "Authorization: Bearer $SUPABASE_OLD_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_OLD_SERVICE_ROLE_KEY" \
  > users_export.json

# 2. Verificar que se exportaron usuarios
echo "Usuarios exportados:"
cat users_export.json | jq '.users | length' 2>/dev/null || echo "Instala jq para contar usuarios: npm install -g jq"

echo "Archivo users_export.json creado con los usuarios exportados."