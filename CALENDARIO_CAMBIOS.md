# Cambios en el Calendario - Mayo 2026

## 🎉 Nuevas Características

### 1. **Cumpleaños Automáticos**
- Los cumpleaños de los jugadores se cargan automáticamente desde la base de datos Supabase
- Se crean eventos automáticos en las fechas de cumpleaños (sin necesidad de editar)
- Los eventos de cumpleaños se muestran con un ícono especial de naranja 🟠
- Los eventos de cumpleaños no se pueden editar ni eliminar (son de solo lectura)

### 2. **Desplegable de Horas**
- Se agregó un campo de hora con todas las horas posibles del día (00:00 a 23:30)
- El formato es en intervalos de 30 minutos para mayor flexibilidad
- Hora por defecto: 10:00
- El campo de hora aparece junto al campo de lugar en una fila lado a lado

### 3. **Mejorado el Formulario de Eventos**
- **Tipo de Evento**: Desplegable con opciones:
  - Partido
  - Entrenamiento
  - Otro (permite especificar tipo personalizado)
  
- **Lugar**: Campo de texto para especificar dónde se realizará el evento
  
- **Hora**: Desplegable con todas las horas del día (intervalos de 30 minutos)
  
- **Descripción**: Campo de texto múltiple para notas adicionales
  
- **Documentos Adjuntos**: Permite cargar archivos PDF

### 4. **Mejoras Visuales**
- Los eventos en la lista de "Próximos eventos" ahora muestran la hora junto a la fecha
- Los eventos de cumpleaños muestran el nombre del jugador en la lista
- Los eventos se colorean según su tipo:
  - 🔴 Rojo: Partidos
  - 🔵 Azul verdoso: Entrenamientos
  - 🟠 Naranja: Cumpleaños
  - 🟡 Amarillo: Otros eventos

## 📋 Estructura de Datos Actualizada

```typescript
interface Event {
  id: string;
  date: string;                    // Formato: DD/MM/YYYY
  type: 'partido' | 'entrenamiento' | 'cumpleaños' | 'otro';
  customType?: string;             // Para tipo 'otro'
  place: string;                   // Ubicación del evento
  time?: string;                   // Formato: HH:MM (ej: "10:00")
  description?: string;            // Notas adicionales
  playerName?: string;             // Para cumpleaños
  pdfFile?: {
    name: string;
    data: string;                  // Base64 encoded
  };
}
```

## 🔄 Integración con Supabase

El componente ahora se conecta con la tabla `players` de Supabase para:
- Obtener la fecha de nacimiento (`birth_date`) de cada jugador activo
- Crear automáticamente eventos de cumpleaños al cargar el calendario

**Campos requeridos en Supabase:**
- `name`: Nombre del jugador
- `birth_date`: Fecha de nacimiento (formato: YYYY-MM-DD)
- `active`: Boolean que indica si el jugador está activo

## 💾 Almacenamiento

- Los eventos personalizados se guardan en `localStorage` bajo la clave `calendarEvents`
- Los cumpleaños se cargan dinámicamente desde Supabase cada vez que se abre el calendario
- Los cumpleaños no se guardan en localStorage (se recalculan automáticamente)

## 🎯 Casos de Uso

### Crear un Evento
1. Haz clic en cualquier día del calendario
2. Completa los campos obligatorios:
   - Tipo de evento
   - Lugar
   - Hora
3. Opcionalmente:
   - Agrega una descripción
   - Carga un documento PDF
4. Haz clic en "Crear Evento"

### Ver Próximos Eventos
- La sección derecha muestra los eventos de los próximos 30 días
- Los eventos se ordenan cronológicamente
- Puedes hacer clic en los botones de acción:
  - 📄 Descargar PDF adjunto
  - ✏️ Editar evento (no disponible para cumpleaños)
  - 🗑️ Eliminar evento (no disponible para cumpleaños)

## 🛠️ Detalles Técnicos

### Cambios en Componentes
- **Calendario.tsx**: Actualizado con nueva lógica de cumpleaños y campo de hora
- **Calendario.css**: Agregados estilos para el nuevo tipo de evento (cumpleaños) y la disposición de formularios en fila

### Dependencias
- React (ya estaba)
- Supabase (ya estaba)
- TypeScript (ya estaba)

## ⚠️ Notas Importantes

1. **Cumpleaños del Año Actual**: Los cumpleaños se muestran para el año 2026 (año actual en la aplicación)
2. **Año Nuevo**: Los cumpleaños se recalculan automáticamente para cada año
3. **Sincronización**: Si se agregan nuevos jugadores a Supabase, se necesita recargar el calendario
4. **Zona Horaria**: Las horas se muestran en formato de 24 horas

## 📱 Responsividad

- En pantallas pequeñas (<760px), el formulario se adapta:
  - Los campos "Lugar" y "Hora" se apilan verticalmente
  - El modal se redimensiona para caber en la pantalla
  - La lista de eventos se compacta

---

**Versión**: 1.0  
**Fecha de Actualización**: 2 de mayo de 2026
