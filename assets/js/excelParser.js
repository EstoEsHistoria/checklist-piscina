// assets/js/excelParser.js
// Funciones que parsean un ArrayBuffer de Excel a objetos de huésped

export function normalizeStringForSearch(str) {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function toTitleCase(str) {
  if (!str) return '';
  return String(str).toLowerCase().split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

/**
 * parseExcel(buffer: ArrayBuffer) => Array<{reservationCode,name,room,isChecked,isNewArrival}>
 * Busca columnas por coincidencia en encabezado para robustez.
 */
export function parseExcel(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    if (!aoa || aoa.length <= 1) return [];

    const headers = aoa[0].map(h => h ? String(h).trim() : '');

    const colIndex = { reservationCode: -1, name: -1, room: -1 };

    headers.forEach((header, idx) => {
      const n = normalizeStringForSearch(header);
      if (n.includes('codigo') && n.includes('reserva')) colIndex.reservationCode = idx;
      else if (n.includes('cliente') || n.includes('nombre')) colIndex.name = idx;
      else if (n.includes('habitacion') || n.includes('hab') || n.includes('habitación')) colIndex.room = idx;
    });

    if (colIndex.reservationCode === -1 || colIndex.name === -1 || colIndex.room === -1) {
      // No throw: return empty for calling code to notify
      return [];
    }

    const data = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      const code = row[colIndex.reservationCode] ? String(row[colIndex.reservationCode]).trim() : '';
      const name = row[colIndex.name] ? toTitleCase(String(row[colIndex.name]).trim()) : '';
      const room = row[colIndex.room] ? String(row[colIndex.room]).trim() : '';
      if (code && name) {
        data.push({
          reservationCode: code,
          name,
          room,
          isChecked: false,
          isNewArrival: false
        });
      }
    }
    return data;
  } catch (e) {
    console.error("parseExcel error:", e);
    return [];
  }
}
