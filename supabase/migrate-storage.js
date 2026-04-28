# Script para copiar buckets y archivos de Storage entre proyectos Supabase
# Requiere Node.js y las dependencias instaladas

# Instalar dependencias si no están
npm install @supabase/supabase-js fs-extra

# Configuración
const SUPABASE_OLD_URL = 'https://itvptjbvvipxkvmpkzrr.supabase.co';
const SUPABASE_OLD_SERVICE_KEY = 'tu-service-role-key-del-proyecto-antiguo';

const SUPABASE_NEW_URL = 'https://seuayvygfqebgxbwsivw.supabase.co';
const SUPABASE_NEW_SERVICE_KEY = 'tu-service-role-key-del-proyecto-nuevo';

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Clientes Supabase
const oldSupabase = createClient(SUPABASE_OLD_URL, SUPABASE_OLD_SERVICE_KEY);
const newSupabase = createClient(SUPABASE_NEW_URL, SUPABASE_NEW_SERVICE_KEY);

async function migrateStorage() {
  try {
    console.log('Iniciando migración de Storage...');

    // 1. Listar buckets del proyecto antiguo
    const { data: buckets, error: bucketsError } = await oldSupabase.storage.listBuckets();
    if (bucketsError) throw bucketsError;

    console.log(`Encontrados ${buckets.length} buckets:`, buckets.map(b => b.name));

    for (const bucket of buckets) {
      const bucketName = bucket.name;
      console.log(`\nProcesando bucket: ${bucketName}`);

      // 2. Crear bucket en el proyecto nuevo (si no existe)
      const { error: createError } = await newSupabase.storage.createBucket(bucketName, {
        public: bucket.public || false
      });

      if (createError && !createError.message.includes('already exists')) {
        console.error(`Error creando bucket ${bucketName}:`, createError);
        continue;
      }

      // 3. Listar archivos del bucket
      const { data: files, error: filesError } = await oldSupabase.storage
        .from(bucketName)
        .list('', { limit: 1000 });

      if (filesError) {
        console.error(`Error listando archivos en ${bucketName}:`, filesError);
        continue;
      }

      console.log(`Encontrados ${files.length} archivos en ${bucketName}`);

      // 4. Descargar y subir cada archivo
      for (const file of files) {
        try {
          console.log(`Copiando: ${file.name}`);

          // Descargar del proyecto antiguo
          const { data: fileData, error: downloadError } = await oldSupabase.storage
            .from(bucketName)
            .download(file.name);

          if (downloadError) {
            console.error(`Error descargando ${file.name}:`, downloadError);
            continue;
          }

          // Subir al proyecto nuevo
          const { error: uploadError } = await newSupabase.storage
            .from(bucketName)
            .upload(file.name, fileData, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadError) {
            console.error(`Error subiendo ${file.name}:`, uploadError);
          }

        } catch (fileError) {
          console.error(`Error procesando archivo ${file.name}:`, fileError);
        }
      }
    }

    console.log('\n✅ Migración de Storage completada!');

  } catch (error) {
    console.error('Error en migración:', error);
  }
}

migrateStorage();