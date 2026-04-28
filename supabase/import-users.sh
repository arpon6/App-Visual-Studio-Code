# Script para importar usuarios en el proyecto nuevo de Supabase
# Ejecuta este script después de export-users.sh

# Configuración del proyecto nuevo
export SUPABASE_NEW_URL="https://seuayvygfqebgxbwsivw.supabase.co"
export SUPABASE_NEW_SERVICE_ROLE_KEY="tu-service-role-key-del-proyecto-nuevo"

# Verificar que existe el archivo de exportación
if [ ! -f "users_export.json" ]; then
    echo "Error: users_export.json no encontrado. Ejecuta primero export-users.sh"
    exit 1
fi

echo "Importando usuarios en el proyecto nuevo..."

# Leer usuarios del archivo JSON y crearlos uno por uno
cat users_export.json | jq -r '.users[] | @base64' | while read user_encoded; do
    user=$(echo $user_encoded | base64 --decode)

    # Extraer datos del usuario
    email=$(echo $user | jq -r '.email')
    password_hash=$(echo $user | jq -r '.encrypted_password // empty')
    user_metadata=$(echo $user | jq -r '.user_metadata // "{}"')
    app_metadata=$(echo $user | jq -r '.app_metadata // "{}"')

    echo "Creando usuario: $email"

    # Crear usuario en el proyecto nuevo
    curl -X POST "$SUPABASE_NEW_URL/auth/v1/admin/users" \
      -H "Authorization: Bearer $SUPABASE_NEW_SERVICE_ROLE_KEY" \
      -H "apikey: $SUPABASE_NEW_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$email\",
        \"password\": \"temporal123\",
        \"user_metadata\": $user_metadata,
        \"app_metadata\": $app_metadata
      }" || echo "Error creando usuario $email"

    # Pequeña pausa para evitar rate limits
    sleep 0.5
done

echo "Importación de usuarios completada."
echo "Nota: Las contraseñas se han establecido a 'temporal123'. Los usuarios deberán resetear sus contraseñas."