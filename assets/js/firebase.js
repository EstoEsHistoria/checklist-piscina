// assets/js/firebase.js
// Firebase wrappers (módulo)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, serverTimestamp,
  onSnapshot, getDocs, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db = null;
let auth = null;
let unsubscribeGuests = null;
let unsubscribeHistory = null;

// CONFIG: Ajusta aquí si lo necesitas
const firebaseConfig = {
  apiKey: "AIzaSyD_vUGs0iDY0w45OlFjPCaOX58YI7J0xDI",
  authDomain: "control-piscina-48181.firebaseapp.com",
  projectId: "control-piscina-48181",
  storageBucket: "control-piscina-48181.firebasestorage.app",
  appId: "1:651276695583:web:02a25b22bcb52d5a05fd2a"
};

const SHARED_COLLECTION_ID = "checklist_pool_data_v1";

export async function initFirebase(onAuthReady = () => {}) {
  if (db) return { db, auth };
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn("Anon sign-in may already be active:", e.message || e);
  }
  onAuthStateChanged(auth, (user) => {
    if (user) onAuthReady(user);
    else console.error("No auth user.");
  });
  return { db, auth };
}

function guestsCollectionRef() {
  if (!db) throw new Error("Firestore no inicializado");
  return collection(db, `pool_data/${SHARED_COLLECTION_ID}/guests`);
}

function historyCollectionRef() {
  if (!db) throw new Error("Firestore no inicializado");
  return collection(db, `pool_logs/stats_summary/daily_logs`);
}

// Escucha en tiempo real la colección de huéspedes
export function listenGuests(onUpdate, onError) {
  if (unsubscribeGuests) unsubscribeGuests();
  const ref = guestsCollectionRef();
  unsubscribeGuests = onSnapshot(ref, (snapshot) => {
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onUpdate(docs);
  }, onError);
  return () => unsubscribeGuests && unsubscribeGuests();
}

// Escucha historial (ordenado desc)
export function listenHistory(onUpdate, onError) {
  if (unsubscribeHistory) unsubscribeHistory();
  const ref = historyCollectionRef();
  const q = query(ref, orderBy("dateLogged", "desc"));
  unsubscribeHistory = onSnapshot(q, (snapshot) => {
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onUpdate(docs);
  }, onError);
  return () => unsubscribeHistory && unsubscribeHistory();
}

// Bulk upload: Archiva (crea un log), borra la lista y sube nuevos docs en batch
export async function archiveAndReplaceAll(newGuestsArray) {
  // 1) Archive summary: create new doc in history
  const historyRef = historyCollectionRef();
  const newLogDoc = doc(historyRef);
  await setDoc(newLogDoc, {
    id: newLogDoc.id,
    dateLogged: serverTimestamp(),
    totalGuests: newGuestsArray.length,
    enteredCount: newGuestsArray.filter(g => g.isChecked).length,
    pendingCount: newGuestsArray.length - newGuestsArray.filter(g => g.isChecked).length
  });

  // 2) Clear existing guests (get all and delete in batch)
  const guestRef = guestsCollectionRef();
  const snapshot = await getDocs(guestRef);
  if (!snapshot.empty) {
    const batchDelete = writeBatch(db);
    snapshot.docs.forEach(d => batchDelete.delete(doc(guestRef, d.id)));
    await batchDelete.commit();
  }

  // 3) Add new guests in batches of 300 (Firestore limits)
  const BATCH_SIZE = 300;
  for (let i = 0; i < newGuestsArray.length; i += BATCH_SIZE) {
    const slice = newGuestsArray.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    slice.forEach(g => {
      const dRef = doc(guestRef);
      batch.set(dRef, { ...g, createdAt: serverTimestamp(), id: dRef.id });
    });
    await batch.commit();
  }
}

// Append guests, avoiding duplicates by reservationCode
export async function appendGuests(newGuestsArray, existingReservationSet = new Set()) {
  const guestRef = guestsCollectionRef();
  const batch = writeBatch(db);
  let added = 0;
  // We'll commit batches of 300
  let count = 0;
  for (const g of newGuestsArray) {
    if (!existingReservationSet.has(g.reservationCode)) {
      const dRef = doc(guestRef);
      batch.set(dRef, { ...g, isNewArrival: true, createdAt: serverTimestamp(), id: dRef.id });
      added++;
      count++;
      if (count >= 300) {
        await batch.commit();
        count = 0;
      }
    }
  }
  if (count > 0) await batch.commit();
  return added;
}

// Update field for a guest (merge)
export async function updateGuestField(guestId, data) {
  const ref = doc(guestsCollectionRef(), guestId);
  await setDoc(ref, data, { merge: true });
}

// Delete all history logs
export async function clearHistoryLogs() {
  const ref = historyCollectionRef();
  const snapshot = await getDocs(ref);
  if (snapshot.empty) return 0;
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(doc(ref, d.id)));
  await batch.commit();
  return snapshot.size;
}

// Export history docs (for CSV building in frontend)
export async function getAllHistory() {
  const ref = historyCollectionRef();
  const snapshot = await getDocs(ref);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
