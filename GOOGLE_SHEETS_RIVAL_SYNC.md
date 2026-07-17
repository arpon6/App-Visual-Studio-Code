# Sincronización Bidireccional con Google Sheets

La lectura desde la hoja ya está integrada en la app. Para permitir también la escritura desde la app hacia Google Sheets hay que desplegar un Google Apps Script como webhook.

## 1. Crear el Apps Script

1. Abre la hoja de cálculo en Google Sheets.
2. Ve a Extensiones > Apps Script.
3. Crea un proyecto nuevo.
4. Copia el contenido de [google-apps-script/rival-sheet-sync.gs](google-apps-script/rival-sheet-sync.gs).
5. Cambia `SYNC_SECRET` por el mismo valor que usarás en `.env`.
6. Ajusta `SHEET_NAME` si tu pestaña no se llama `Hoja 1`.

## 2. Desplegarlo como Web App

1. Pulsa Desplegar > Nueva implementación.
2. Tipo: Aplicación web.
3. Ejecutar como: tú.
4. Quién tiene acceso: Cualquiera.
5. Despliega y copia la URL `.../exec`.

## 3. Configurar variables de entorno

En tu `.env` o en Vercel:

```env
RIVAL_SHEET_WRITE_URL=https://script.google.com/macros/s/tu-script-id/exec
RIVAL_SHEET_SYNC_SECRET=tu-secreto-fuerte
RIVAL_SHEET_ID=1Psz7LtFGTR8rNPdge7BrN_k0r_78XscY3o6PuuR354E
RIVAL_SHEET_GID=0
```

## 4. Qué hace la escritura

- La app envía el equipo seleccionado y su lista de jugadores.
- El Apps Script busca filas donde la columna C coincida con el equipo.
- Actualiza las columnas D, E y F de esas filas.
- Si faltan filas para ese equipo, añade nuevas.

## 5. Limitaciones actuales

- Solo se sincronizan Equipo, Jugador, Dorsal y Características.
- No se tocan el resto de columnas de scouting.
- Si cambias el nombre de la pestaña o la estructura de columnas, tendrás que ajustar el script.