// assets/js/ui.js
// UI helpers: notifications, render list, modals, debounce
import { updateGuestField } from './firebase.js';

const notificationArea = () => document.getElementById('notification-area');

export function showNotification(message, type = 'success') {
  const area = notificationArea();
  if (!area) return;
  const div = document.createElement('div');
  const color = type === 'success' ? 'bg-green-500' : (type === 'warning' ? 'bg-yellow-500' : 'bg-red-500');
  div.className = `${color} text-white px-4 py-2 rounded-xl shadow-xl text-sm mb-2 opacity-0 transition-opacity duration-300`;
  div.style.minWidth = '150px';
  div.style.textAlign = 'center';
  div.textContent = message;
  area.appendChild(div);
  // show
  requestAnimationFrame(() => div.classList.remove('opacity-0'));
  setTimeout(() => {
    div.classList.add('opacity-0');
    div.addEventListener('transitionend', () => div.remove());
  }, 3000);
}

// Debounce util
export function debounce(fn, wait = 250) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* Rendering guest list using DocumentFragment to minimize reflows.
   guests: array of guest objects
   options: { onToggle: fn(guestId) }
*/
export function renderGuestList(guests, options = {}) {
  const container = document.getElementById('guest-list-container');
  const guestCount = document.getElementById('guest-count');
  const enteredCountEl = document.getElementById('entered-count');
  const lastUpdated = document.getElementById('last-updated');

  if (!container) return;

  container.innerHTML = ''; // clear quickly
  if (!guests || guests.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-500 p-8">No hay huéspedes en la lista.</p>';
    guestCount.textContent = `Total de Huéspedes: 0`;
    enteredCountEl.textContent = `Ingresados: 0`;
    if (lastUpdated) lastUpdated.textContent = 'No hay lista cargada.';
    return;
  }

  const frag = document.createDocumentFragment();
  let entered = 0;

  for (const guest of guests) {
    if (guest.isChecked) entered++;
    const card = createGuestCard(guest, options.onToggle);
    frag.appendChild(card);
  }

  container.appendChild(frag);

  guestCount.textContent = `Total de Huéspedes: ${guests.length}`;
  enteredCountEl.textContent = `Ingresados: ${entered}`;

  // set last updated if possible (createdAt max)
  const ts = guests.reduce((latest, g) => {
    if (g.createdAt && g.createdAt.toDate) {
      const d = g.createdAt.toDate();
      return d > latest ? d : latest;
    }
    return latest;
  }, new Date(0));
  if (ts && ts.getTime() > 0 && lastUpdated) {
    lastUpdated.textContent = `Lista cargada: ${ts.toLocaleDateString('es-ES')} ${ts.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'})}`;
  } else if (lastUpdated) {
    lastUpdated.textContent = 'Lista cargada (fecha no disp.)';
  }
}

// Helper to build a card (returns DOM element)
function createGuestCard(guest, onToggle) {
  const wrapper = document.createElement('div');
  wrapper.className = "guest-card w-full p-3 flex justify-between items-center rounded-xl shadow-md cursor-pointer select-none border-l-8";
  wrapper.style.userSelect = 'none';

  const left = document.createElement('div');
  left.className = "flex-grow min-w-0 pr-4";

  const nameEl = document.createElement('p');
  nameEl.className = "text-lg font-bold truncate";
  nameEl.textContent = guest.name;

  const meta = document.createElement('div');
  meta.className = "flex items-center text-xs text-gray-500 mt-1";
  meta.innerHTML = `<span class="text-base font-bold text-gray-700">Hab: <span class="font-extrabold">${guest.room}</span></span>
                    <span class="font-bold text-gray-400 mx-2">|</span>
                    <span class="text-xs text-gray-500 truncate"><span class="font-medium">${guest.reservationCode}</span></span>`;

  const status = document.createElement('p');
  status.className = "text-xs mt-1 uppercase";

  const right = document.createElement('div');
  right.className = "check-button flex items-center justify-center";

  // determine state styles
  if (guest._alert === true) {
    wrapper.classList.add('guest-card-alert');
    right.classList.add('bg-orange-500');
    nameEl.style.color = '#E9772A';
    status.textContent = 'CONFIRMAR EGRESO';
    right.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
  } else if (guest.isChecked) {
    wrapper.classList.add('guest-card-checked');
    right.classList.add('bg-green-500');
    nameEl.style.color = '#059669';
    status.textContent = 'INGRESADO';
    right.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
  } else {
    wrapper.classList.add('guest-card-unchecked');
    right.classList.add('bg-gray-200');
    nameEl.style.color = '#111827';
    status.textContent = guest.isNewArrival ? 'PENDIENTE - Check IN' : 'PENDIENTE DE INGRESO';
    right.innerHTML = `<svg class="h-6 w-6 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>`;
  }

  left.appendChild(nameEl);
  left.appendChild(meta);
  left.appendChild(status);

  wrapper.appendChild(left);
  wrapper.appendChild(right);

  // click handler: call provided onToggle and add local brief visual (handled in main)
  wrapper.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof onToggle === 'function') onToggle(guest);
  });

  return wrapper;
}

// Toggle confirmation UI helper (the actual DB update lives in main/firebase)
export async function toggleCheckinUI(guest, setAlertFn) {
  // setAlertFn toggles local flag (used by render)
  if (!guest) return;
  if (guest.isChecked === false) {
    // mark checked true
    await updateGuestField(guest.id, { isChecked: true });
  } else if (guest._alert === true) {
    // confirm uncheck
    setAlertFn(guest.id, false);
    await updateGuestField(guest.id, { isChecked: false });
  } else {
    // put temporary alert flag (UI only)
    setAlertFn(guest.id, true);
  }
}
