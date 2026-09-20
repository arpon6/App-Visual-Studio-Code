import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('D:/App Mi club/.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
);

const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const actaRes = await fetch(`${url}/rest/v1/actas_partidos?fecha=eq.2026-09-18&select=*`, { headers });
const actas = await actaRes.json();
if (!actas.length) throw new Error('No se encontró el acta del 2026-09-18');
const actaId = actas[0].id;

const rows = [
  { acta_id: actaId, dorsal: 1, nombre: 'Millán Honrubia Basalo', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 2, nombre: 'Asier Benito Sánchez', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 3, nombre: 'Óscar Loza Merino', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 4, nombre: 'Pablo Baños Lasheras', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 5, nombre: 'Alex Maestresalas Andueza', titular: true, goles: 0, tarjetas: 0, minutos: 71 },
  { acta_id: actaId, dorsal: 6, nombre: 'Marcos García Asensio', titular: true, goles: 0, tarjetas: 1, minutos: 90 },
  { acta_id: actaId, dorsal: 7, nombre: 'José Eizaguirre Bengoechea', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 8, nombre: 'Jorge Olarte Sáenz', titular: false, goles: 1, tarjetas: 1, minutos: 32 },
  { acta_id: actaId, dorsal: 9, nombre: 'Rubén Pérez Ortega', titular: true, goles: 0, tarjetas: 0, minutos: 90 },
  { acta_id: actaId, dorsal: 10, nombre: 'Iñaki Rivas Prado', titular: true, goles: 0, tarjetas: 0, minutos: 81 },
  { acta_id: actaId, dorsal: 11, nombre: 'Peio Córdoba Esteban', titular: true, goles: 0, tarjetas: 1, minutos: 81 },
  { acta_id: actaId, dorsal: 14, nombre: 'Yassine Ziyani Bensaad', titular: false, goles: 0, tarjetas: 0, minutos: 9 },
  { acta_id: actaId, dorsal: 15, nombre: 'Iván Munilla Monreal', titular: true, goles: 0, tarjetas: 1, minutos: 90 },
  { acta_id: actaId, dorsal: 16, nombre: 'Manuel Pinillos del Busto', titular: false, goles: 0, tarjetas: 0, minutos: 9 },
  { acta_id: actaId, dorsal: 19, nombre: 'Ismael Ramos Santana', titular: true, goles: 0, tarjetas: 0, minutos: 81 },
  { acta_id: actaId, dorsal: 20, nombre: 'Marc Lucena Rodriguez', titular: false, goles: 0, tarjetas: 0, minutos: 58 },
  { acta_id: actaId, dorsal: 25, nombre: 'Adrián González Sarasa', titular: true, goles: 0, tarjetas: 1, minutos: 90 },
];

const deleteRes = await fetch(`${url}/rest/v1/estadisticas_actas?acta_id=eq.${actaId}`, {
  method: 'DELETE',
  headers,
});
if (!deleteRes.ok) {
  const text = await deleteRes.text();
  console.log('DELETE_STATUS', deleteRes.status, text);
}

const insertRes = await fetch(`${url}/rest/v1/estadisticas_actas?select=*`, {
  method: 'POST',
  headers,
  body: JSON.stringify(rows),
});
const insertText = await insertRes.text();
console.log('INSERT_STATUS', insertRes.status);
console.log(insertText);

const verifyRes = await fetch(`${url}/rest/v1/estadisticas_actas?acta_id=eq.${actaId}&select=*`, { headers });
const verify = await verifyRes.json();
console.log('VERIFY_COUNT', verify.length);
console.log(JSON.stringify(verify.map((row) => ({ dorsal: row.dorsal, nombre: row.nombre, titular: row.titular, goles: row.goles, tarjetas: row.tarjetas, minutos: row.minutos })), null, 2));
