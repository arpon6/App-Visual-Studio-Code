const chokidar = require('chokidar');
const { exec } = require('child_process');

// Directorios a monitorear
const watchedPaths = ['src', 'supabase', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts'];

const watcher = chokidar.watch(watchedPaths, {
  ignored: /(^|[\/\\])\../, // Ignorar archivos ocultos
  persistent: true
});

let timeoutId;

watcher.on('change', (path) => {
  console.log(`Cambio detectado en: ${path}`);
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    exec('git add .', (err, stdout, stderr) => {
      if (err) {
        console.error('Error en git add:', err);
        return;
      }
      exec('git diff --cached --quiet', (err2, stdout2, stderr2) => {
        if (err2) {
          // Hay cambios staged
          exec('git commit -m "Auto commit: cambios detectados"', (err3, stdout3, stderr3) => {
            if (err3) {
              console.error('Error en git commit:', err3);
              return;
            }
            exec('git push origin master', (err4, stdout4, stderr4) => {
              if (err4) {
                console.error('Error en git push:', err4);
                return;
              }
              console.log('Commit y push automáticos completados.');
            });
          });
        } else {
          console.log('No hay cambios para commit.');
        }
      });
    });
  }, 5000); // Esperar 5 segundos después del último cambio
});

console.log('Monitoreo automático iniciado. Presiona Ctrl+C para detener.');