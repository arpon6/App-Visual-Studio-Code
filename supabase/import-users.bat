@echo off
REM Script para importar usuarios en el proyecto nuevo de Supabase (Windows)

REM Configuración del proyecto nuevo
set SUPABASE_NEW_URL=https://seuayvygfqebgxbwsivw.supabase.co
set SUPABASE_NEW_SERVICE_ROLE_KEY=tu-service-role-key-del-proyecto-nuevo

REM Verificar que existe el archivo de exportación
if not exist "users_export.json" (
    echo Error: users_export.json no encontrado. Ejecuta primero export-users.bat
    pause
    exit /b 1
)

echo Importando usuarios en el proyecto nuevo...

REM Nota: Este script simplificado asume que tienes Node.js
REM Para una importación completa, necesitarías procesar el JSON con Node.js

echo.
echo Archivo users_export.json encontrado.
echo Para una importación completa, usa el script Node.js correspondiente.
echo.
echo Las contraseñas se resetearán. Los usuarios deberán cambiarlas después.

pause