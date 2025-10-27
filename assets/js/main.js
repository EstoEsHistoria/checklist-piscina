// assets/js/main.js
import * as FB from './firebase.js';
import { parseExcel, normalizeStringForSearch } from './excelParser.js';
import { renderLineChart } from './charts.js';
import { renderGuestList, showNotification, debounce, toggleCheckinUI } from './ui.js';

let allGuests = [];
let alertState = new Map(); // local UI-only state for confirm-to-uncheck
let currentSortBy = 'name';
let currentSearchTerm = '';
let guestUnsubscribe = null;
let historyUnsubscribe = null;
const MASTER_PASSWORD = 'sanlorenzo454'; // placeholder - move to server ideally

// utils
function applySorting(guests) {
  if (!Array.isArray(guests)) return;
  if (currentSortBy === 'name') guests.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  else if (currentSortBy === 'room') {
    guests.sort((a,b) => {
      const na = parseInt(a.room, 10); const nb = parseInt(b.room, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return (a.room||'').localeCompare(b.room||'');
    });
  } else if (currentSortBy === 'checked_desc') {
    guests.sort((a,b) => (a.isChecked === b.isChecked) ? 0 : (a.isChecked ? -1 : 1));
  } else if (currentSortBy === 'checked_asc') {
    guests.sort((a,b) => (a.isChecked === b.isChecked) ? 0 : (a.isChecked ? 1 : -1));
  }
}

function filterGuestsBySearch(guests, term) {
  if (!term) return guests;
  const norm = normalizeStringForSearch(term);
  return guests.filter(g => (normalizeStringForSearch(g.name).includes(norm) || normalizeStringForSearch(g.room).includes(norm)));
}

// set alert state (UI)
function setAlert(guestId, value) {
  if (value) alertState.set(guestId, true);
  else alertState.delete(guestId);
  // apply to allGuests for render convenience
  allGuests = allGuests.map(g => ({ ...g, _alert: alertState.has(g.id) }));
  renderCurrentList();
}

// Render current list using filters + sort
function renderCurrentList() {
  let toRender = [...allGuests];
  applySorting(toRender);
  toRender = filterGuestsBySearch(toRender, currentSearchTerm);
  // pass onToggle handler that uses toggleCheckinUI
  renderGuestList(toRender, { onToggle: async (guest) => {
    // use UI helper which calls firebase update
    if (!guest) return;
    if (guest.isChecked && !alertState.has(guest.id)) {
      // set alert local
      setAlert(guest.id, true);
      showNotification(`Toca de nuevo para desmarcar a ${guest.name}.`, 'warning');
      // auto-remove alert after 3s if unchanged
      setTimeout(() => {
        if (alertState.has(guest.id)) {
          setAlert(guest.id, false);
          renderCurrentList();
        }
      }, 3000);
      return;
    }
    // else either check-in or confirm uncheck
    try {
      await toggleCheckinUI(guest, setAlert);
    } catch (e) {
      console.error(e);
      showNotification('Error al actualizar huésped.', 'error');
    }
  }});
}

// boot
async function bootstrap() {
  await FB.initFirebase(async (user) => {
    // user ready: attach listeners
    startGuestListener();
    setupUIBindings();
    document.getElementById('loading-message')?.remove();
  });
}

// guest listener
function startGuestListener() {
  if (guestUnsubscribe) guestUnsubscribe();
  guestUnsubscribe = FB.listenGuests((docs) => {
    allGuests = docs;
    // merge alert flags into allGuests
    allGuests = allGuests.map(g => ({ ...g, _alert: alertState.has(g.id) }));
    renderCurrentList();
  }, (err) => {
    console.error("listenGuests error:", err);
    showNotification("Error de conexión a la lista. (Verifique reglas de Firebase)", 'error');
  });
}

// history listener for graphs
function startHistoryListener(renderGraph = false) {
  if (historyUnsubscribe) historyUnsubscribe();
  historyUnsubscribe = FB.listenHistory((logs) => {
    if (!logs || logs.length === 0) {
      const area = document.getElementById('chart-message-area');
      if (renderGraph) area.innerHTML = '<p class="text-center text-gray-500 p-8">No hay suficientes registros para generar el gráfico.</p>';
      document.getElementById('history-stats-container').innerHTML = '<p class="text-center text-gray-500 p-8">Aún no hay registros históricos guardados.</p>';
      return;
    }
    // populate history list (simple)
    const container = document.getElementById('history-stats-container');
    if (container) {
      container.innerHTML = logs.map(l => {
        const dateStr = (l.dateLogged && l.dateLogged.toDate) ? `${l.dateLogged.toDate().toLocaleDateString('es-ES')} ${l.dateLogged.toDate().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'})}` : 'Fecha desconocida';
        const enteredPct = l.totalGuests ? Math.round((l.enteredCount / l.totalGuests) * 100) : 0;
        return `<div class="bg-white p-4 rounded-xl shadow border-l-4 border-blue-500">
                  <div class="flex justify-between items-start">
                    <div><p class="text-sm font-semibold text-gray-600">Registro guardado:</p><p class="text-lg font-bold text-gray-900">${dateStr}</p></div>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-3 text-center">
                    <div class="bg-blue-50 p-2 rounded-lg"><p class="text-xs text-blue-800 font-semibold">TOTAL</p><p class="text-xl font-bold text-blue-900">${l.totalGuests}</p></div>
                    <div class="bg-green-50 p-2 rounded-lg"><p class="text-xs text-green-800 font-semibold">INGRESADOS</p><p class="text-xl font-bold text-green-900">${l.enteredCount} (${enteredPct}%)</p></div>
                  </div>
                </div>`;
      }).join('');
    }

    if (renderGraph) {
      // prepare chart data
      const sorted = [...logs].sort((a,b) => a.dateLogged.toDate() - b.dateLogged.toDate());
      const labels = sorted.map(s => {
        const d = s.dateLogged.toDate();
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      });
      const enteredData = sorted.map(s => s.enteredCount || 0);
      const totalData = sorted.map(s => s.totalGuests || 0);

      if (sorted.length < 2) {
        document.getElementById('chart-message-area').innerHTML = '<p class="text-center text-red-600 p-8">Se necesitan al menos 2 registros para dibujar un gráfico de tendencias.</p>';
        return;
      }
      renderLineChart('daily-chart', labels, enteredData, totalData);
    }
  }, (err) => {
    console.error("listenHistory error:", err);
    showNotification("Error al cargar historial.", 'error');
  });
}

// UI bindings & file handling
function setupUIBindings() {
  const searchInput = document.getElementById('search-input');
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-button');
  const sortBy = document.getElementById('sort-by');

  // debounce search
  searchInput.addEventListener('input', debounce((e) => {
    currentSearchTerm = e.target.value.trim();
    renderCurrentList();
  }, 300));

  uploadBtn.addEventListener('click', () => {
    // show simple choice: full vs append
    const mode = confirm("Pulse ACEPTAR para Carga Completa (archiva y reemplaza). CANCELAR para Añadir nuevas llegadas.");
    fileInput.dataset.uploadMode = mode ? 'full' : 'append';
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.ods') && !name.endsWith('.xlsm') && !name.endsWith('.xlsb')) {
      showNotification('Por favor suba un archivo Excel válido.', 'error');
      fileInput.value = null;
      return;
    }
    const buf = await file.arrayBuffer();
    const data = parseExcel(buf);
    if (!data || data.length === 0) {
      showNotification('El archivo Excel está vacío o mal formateado (no se detectaron columnas requeridas).', 'error');
      fileInput.value = null;
      return;
    }
    // handle modes
    const mode = fileInput.dataset.uploadMode || 'full';
    if (mode === 'full') {
      if (!confirm(`Se guardará un log y se reemplazará la lista actual con ${data.length} huéspedes. Continuar?`)) {
        fileInput.value = null;
        return;
      }
      try {
        await FB.archiveAndReplaceAll(data);
        showNotification('Lista actualizada y registro guardado.', 'success');
      } catch (e) {
        console.error(e);
        showNotification('Error al subir lista completa.', 'error');
      }
    } else {
      // append mode: build existing set of reservation codes
      const existingSet = new Set(allGuests.map(g => g.reservationCode));
      try {
        const added = await FB.appendGuests(data, existingSet);
        showNotification(`${added} huéspedes nuevos añadidos.`, 'success');
      } catch (e) {
        console.error(e);
        showNotification('Error al añadir huéspedes.', 'error');
      }
    }
    fileInput.value = null;
  });

  sortBy.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'checked') {
      // toggle between desc & asc
      currentSortBy = currentSortBy === 'checked_desc' ? 'checked_asc' : 'checked_desc';
      // set display to 'checked' (keeps UI)
      sortBy.value = 'checked';
    } else {
      currentSortBy = val;
    }
    renderCurrentList();
  });

  // view nav
  document.getElementById('btn-history').addEventListener('click', () => {
    document.getElementById('list-view-container').classList.add('hidden');
    document.getElementById('history-view-container').classList.remove('hidden');
    document.getElementById('graph-view-container').classList.add('hidden');
    startHistoryListener(false);
  });
  document.getElementById('btn-graph').addEventListener('click', () => {
    document.getElementById('list-view-container').classList.add('hidden');
    document.getElementById('history-view-container').classList.add('hidden');
    document.getElementById('graph-view-container').classList.remove('hidden');
    startHistoryListener(true);
  });
  document.getElementById('btn-history-back').addEventListener('click', () => {
    document.getElementById('list-view-container').classList.remove('hidden');
    document.getElementById('history-view-container').classList.add('hidden');
  });
  document.getElementById('btn-graph-back').addEventListener('click', () => {
    document.getElementById('list-view-container').classList.remove('hidden');
    document.getElementById('graph-view-container').classList.add('hidden');
  });

  // export history
  document.getElementById('export-history').addEventListener('click', async () => {
    try {
      const logs = await FB.getAllHistory();
      if (!logs || logs.length === 0) {
        showNotification('No hay datos en el historial para exportar.', 'error');
        return;
      }
      const sep = ';';
      let csv = `"Fecha";"Total Lista";"Ingresados";"Pendientes"\n`;
      logs.forEach(l => {
        const dateStr = (l.dateLogged && l.dateLogged.toDate) ? `${l.dateLogged.toDate().toLocaleDateString('es-ES')} ${l.dateLogged.toDate().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'})}` : 'Fecha desconocida';
        csv += [`"${dateStr}"`, l.totalGuests, l.enteredCount, l.pendingCount].join(sep) + '\n';
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `historial_ingresos_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showNotification('Historial exportado correctamente.', 'success');
    } catch (e) {
      console.error(e);
      showNotification('Fallo al exportar el historial.', 'error');
    }
  });

  // delete all history (with password prompt)
  document.getElementById('delete-all').addEventListener('click', async () => {
    const pw = prompt('Ingrese la contraseña maestra para confirmar borrado masivo:');
    if (pw !== MASTER_PASSWORD) {
      showNotification('Contraseña incorrecta. Operación cancelada.', 'error');
      return;
    }
    try {
      await FB.clearHistoryLogs();
      showNotification('¡TODOS los registros históricos han sido eliminados!', 'success');
    } catch (e) {
      console.error(e);
      showNotification('Error al eliminar registros históricos.', 'error');
    }
  });
}

// start app
bootstrap();
