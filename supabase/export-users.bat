@echo off
REM Script para exportar usuarios del proyecto antiguo de Supabase (Windows)
REM Reemplaza las variables con tus credenciales reales

REM Configuración del proyecto antiguo
set SUPABASE_OLD_URL=https://itvptjbvvipxkvmpkzrr.supabase.co
set SUPABASE_OLD_SERVICE_ROLE_KEY=tu-service-role-key-del-proyecto-antiguo

REM Configuración del proyecto nuevo
set SUPABASE_NEW_URL=https://seuayvygfqebgxbwsivw.supabase.co
set SUPABASE_NEW_SERVICE_ROLE_KEY=tu-service-role-key-del-proyecto-nuevo

echo Exportando usuarios del proyecto antiguo...

REM 1. Exportar usuarios del proyecto antiguo
curl -X GET "%SUPABASE_OLD_URL%/auth/v1/admin/users" ^
  -H "Authorization: Bearer %SUPABASE_OLD_SERVICE_ROLE_KEY%" ^
  -H "apikey: %SUPABASE_OLD_SERVICE_ROLE_KEY%" ^
  > users_export.json

echo Usuarios exportados en users_export.json
echo.
echo Para importar, ejecuta: import-users.bat