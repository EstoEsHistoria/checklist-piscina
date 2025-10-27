import * as FB from './firebase.js';
import { parseExcel, normalizeStringForSearch } from './excelParser.js';
import { renderGuestList, showNotification, debounce, toggleCheckinUI } from './ui.js';

let allGuests = [];
let alertState = new Map();
let currentSortBy = 'name';
let currentSearchTerm = '';
const MASTER_PASSWORD = 'sanlorenzo454';

let fileInput, uploadBtn, uploadTypeModalEl, uploadFullBtn, uploadAppendBtn, uploadCancelBtn;

// Bootstrap
async function bootstrap() {
  await FB.initFirebase(() => startGuestListener());
  setupUIBindings();
  document.getElementById('loading-message')?.remove();
}

function startGuestListener() {
  FB.listenGuests((docs) => {
    allGuests = docs.map(g => ({ ...g, _alert: alertState.has(g.id) }));
    renderCurrentList();
  }, (err) => console.error(err));
}

function renderCurrentList() {
  let filtered = [...allGuests];
  filtered = filterGuests(filtered, currentSearchTerm);
  renderGuestList(filtered, { onToggle: g => toggleCheckinUI(g, setAlert) });
}

function filterGuests(arr, term) {
  if (!term) return arr;
  const norm = normalizeStringForSearch(term);
  return arr.filter(g => normalizeStringForSearch(g.name).includes(norm) || normalizeStringForSearch(g.room).includes(norm));
}

function setAlert(id, val) {
  if (val) alertState.set(id, true);
  else alertState.delete(id);
  allGuests = allGuests.map(g => ({ ...g, _alert: alertState.has(g.id) }));
  renderCurrentList();
}

function setupUIBindings() {
  fileInput = document.getElementById('file-input');
  uploadBtn = document.getElementById('upload-button');
  uploadTypeModalEl = document.getElementById('upload-type-modal');
  uploadFullBtn = document.getElementById('upload-full-btn');
  uploadAppendBtn = document.getElementById('upload-append-btn');
  uploadCancelBtn = document.getElementById('upload-cancel-btn');

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce((e) => {
    currentSearchTerm = e.target.value.trim();
    renderCurrentList();
  }, 300));

  // Mostrar modal de opciones
  uploadBtn.addEventListener('click', () => {
    uploadTypeModalEl.classList.remove('hidden');
  });

  uploadFullBtn.addEventListener('click', () => {
    fileInput.dataset.mode = 'full';
    uploadTypeModalEl.classList.add('hidden');
    fileInput.click();
  });

  uploadAppendBtn.addEventListener('click', () => {
    fileInput.dataset.mode = 'append';
    uploadTypeModalEl.classList.add('hidden');
    fileInput.click();
  });

  uploadCancelBtn.addEventListener('click', () => {
    uploadTypeModalEl.classList.add('hidden');
  });

  // Procesar archivo Excel
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const buf = await file.arrayBuffer();
    const data = parseExcel(buf);
    if (!data.length) {
      showNotification("Archivo Excel inválido o vacío", "error");
      return;
    }

    try {
      if (fileInput.dataset.mode === 'append') {
        const existing = new Set(allGuests.map(g => g.reservationCode));
        const added = await FB.appendGuests(data, existing);
        showNotification(`${added} huéspedes añadidos`, 'success');
      } else {
        await FB.archiveAndReplaceAll(data);
        showNotification('Lista reemplazada correctamente', 'success');
      }
    } catch (err) {
      console.error(err);
      showNotification("Error al procesar la lista", "error");
    }
  });
}

bootstrap();

