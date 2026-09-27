// Brave History Sync Replayer — Panel Logic

let urlList = [];
let currentIndex = 0;
let isRunning = false;
let isPaused = false;
let targetRate = 40; // items per second
let startTime = 0;
let processedThisSession = 0;

// DOM Elements
const statTotal = document.getElementById('stat-total');
const statSynced = document.getElementById('stat-synced');
const statPending = document.getElementById('stat-pending');
const statEta = document.getElementById('stat-eta');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercentage = document.getElementById('progress-percentage');
const progressCounts = document.getElementById('progress-counts');
const currentUrlDisplay = document.getElementById('current-url-display');
const statusBadge = document.getElementById('status-badge');
const sourceStatus = document.getElementById('source-status');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const btnScanBrowser = document.getElementById('btn-scan-browser');
const fileInput = document.getElementById('file-input');
const speedSelect = document.getElementById('speed-select');
const terminal = document.getElementById('terminal');
const btnClearLog = document.getElementById('btn-clear-log');
const btnSyncInternals = document.getElementById('btn-sync-internals');
const btnSyncSettings = document.getElementById('btn-sync-settings');

// Helper to format time (seconds to MM:SS)
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Log message to terminal UI
function log(msg, type = 'normal') {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  let msgClass = 'log-msg';
  if (type === 'highlight') msgClass += ' highlight';
  if (type === 'success') msgClass += ' success';

  entry.innerHTML = `<span class="log-time">[${timeStr}]</span><span class="${msgClass}">${msg}</span>`;
  terminal.prepend(entry);

  if (terminal.children.length > 100) {
    terminal.removeChild(terminal.lastChild);
  }
}

// Scan browser history directly via chrome.history API
async function scanBrowserHistory() {
  try {
    log('Escaneando historial del navegador directamente vía chrome.history API...');
    sourceStatus.textContent = 'Escaneando historial...';

    const results = await chrome.history.search({
      text: '',
      startTime: 0,
      maxResults: 50000
    });

    const seen = new Set();
    const cleanList = [];

    for (const item of results) {
      if (item.url && (item.url.startsWith('http://') || item.url.startsWith('https://'))) {
        const trimmed = item.url.trim();
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          cleanList.push({
            url: trimmed,
            title: item.title || '',
            visits: item.visitCount || 1
          });
        }
      }
    }

    urlList = cleanList;
    sourceStatus.textContent = `Navegador (${urlList.length.toLocaleString()} URLs)`;
    log(`Escaneo completado: ${urlList.length.toLocaleString()} URLs web únicas encontradas en el navegador.`, 'success');
    
    // Check saved index
    await checkSavedIndex();
    updateUI();
  } catch (err) {
    log(`Error al escanear historial del navegador: ${err.message}`, 'highlight');
    sourceStatus.textContent = 'Error al escanear';
  }
}

// Check saved progress from chrome.storage.local
async function checkSavedIndex() {
  const stored = await chrome.storage.local.get(['syncIndex']);
  if (stored.syncIndex && stored.syncIndex > 0 && stored.syncIndex < urlList.length) {
    currentIndex = stored.syncIndex;
    log(`Sesión previa encontrada: reanudación disponible desde la URL #${currentIndex.toLocaleString()}.`, 'highlight');
  } else if (!stored.syncIndex || stored.syncIndex >= urlList.length) {
    currentIndex = 0;
  }
}

// Load URLs and persistent state
async function init() {
  try {
    log('Buscando archivo local urls.json...');
    const response = await fetch('urls.json');
    if (!response.ok) {
      throw new Error(`urls.json no encontrado (código ${response.status})`);
    }
    urlList = await response.json();
    sourceStatus.textContent = `Archivo local urls.json (${urlList.length.toLocaleString()} URLs)`;
    log(`Se cargaron ${urlList.length.toLocaleString()} URLs desde urls.json.`, 'success');

    await checkSavedIndex();
    updateUI();
  } catch (err) {
    log(`urls.json no disponible. Procediendo a escanear historial del navegador...`);
    await scanBrowserHistory();
  }
}

// Update all UI elements
function updateUI() {
  const total = urlList.length;
  const synced = currentIndex;
  const pending = Math.max(0, total - synced);
  const pct = total > 0 ? ((synced / total) * 100).toFixed(1) : 0;

  statTotal.textContent = total.toLocaleString();
  statSynced.textContent = synced.toLocaleString();
  statPending.textContent = pending.toLocaleString();
  
  progressBarFill.style.width = `${pct}%`;
  progressPercentage.textContent = `${pct}% completado`;
  progressCounts.textContent = `${synced.toLocaleString()} / ${total.toLocaleString()}`;

  if (isRunning) {
    statusBadge.textContent = 'Sincronizando...';
    statusBadge.className = 'status-badge running';
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.textContent = '⏸️ Pausar';
  } else if (isPaused) {
    statusBadge.textContent = 'Pausado';
    statusBadge.className = 'status-badge paused';
    btnStart.disabled = false;
    btnStart.textContent = '▶️ Reanudar';
    btnPause.disabled = true;
  } else if (currentIndex >= total && total > 0) {
    statusBadge.textContent = 'Completado';
    statusBadge.className = 'status-badge done';
    btnStart.disabled = true;
    btnPause.disabled = true;
    currentUrlDisplay.textContent = '¡Todo el historial ha sido enviado a Brave Sync con éxito!';
    statEta.textContent = '00:00';
  } else {
    statusBadge.textContent = 'Listo para iniciar';
    statusBadge.className = 'status-badge';
    btnStart.disabled = total === 0;
    btnStart.textContent = '▶️ Iniciar Sincronización';
    btnPause.disabled = true;
  }
}

// Main sync processing loop
async function processSync() {
  startTime = Date.now();
  processedThisSession = 0;

  while (isRunning && currentIndex < urlList.length) {
    const item = urlList[currentIndex];
    
    try {
      // Send URL into Chromium's native history backend
      // This immediately invokes OnURLVisited -> MaybeCommit -> processor_->Put()
      await chrome.history.addUrl({ url: item.url });
    } catch (e) {
      // Ignore individual malformed URLs and continue
    }

    currentIndex++;
    processedThisSession++;

    // Update current URL ticker
    currentUrlDisplay.textContent = `[#${currentIndex.toLocaleString()}] ${item.title ? item.title + ' — ' : ''}${item.url}`;

    // Batch logging every 90 items (matches Chromium's kDefaultMaxCommitBatchSize)
    if (currentIndex % 90 === 0 || currentIndex === urlList.length) {
      log(`Lote confirmado: ${currentIndex.toLocaleString()} / ${urlList.length.toLocaleString()} enviadas a Brave Sync.`, 'success');
      await chrome.storage.local.set({ syncIndex: currentIndex });
    }

    // Dynamic ETA calculation
    const elapsedSec = (Date.now() - startTime) / 1000;
    if (elapsedSec > 2 && processedThisSession > 10) {
      const currentRate = processedThisSession / elapsedSec;
      const remainingItems = urlList.length - currentIndex;
      const remainingSec = remainingItems / currentRate;
      statEta.textContent = formatTime(remainingSec);
    }

    // Refresh UI every 10 items
    if (currentIndex % 10 === 0) {
      updateUI();
    }

    // Controlled pacing to allow Brave Sync threads to process & flush USS batches
    const delayMs = Math.max(5, Math.floor(1000 / targetRate));
    await new Promise(r => setTimeout(r, delayMs));
  }

  if (currentIndex >= urlList.length && urlList.length > 0) {
    isRunning = false;
    isPaused = false;
    await chrome.storage.local.set({ syncIndex: currentIndex });
    log('🎉 ¡FINALIZADO! Todas las URLs se han enviado al motor de Brave Sync.', 'success');
    log('Abre Brave en tu Android con la sincronización activa. El historial aparecerá en unos minutos.', 'highlight');
    updateUI();
  }
}

// Event Listeners
btnStart.addEventListener('click', () => {
  if (isRunning) return;
  isRunning = true;
  isPaused = false;
  targetRate = parseInt(speedSelect.value, 10) || 40;
  log(`Iniciando sincronización a ~${targetRate} URLs/segundo...`);
  updateUI();
  processSync();
});

btnPause.addEventListener('click', () => {
  if (!isRunning) return;
  isRunning = false;
  isPaused = true;
  chrome.storage.local.set({ syncIndex: currentIndex });
  log(`Sincronización pausada en el elemento #${currentIndex.toLocaleString()}.`, 'highlight');
  updateUI();
});

btnReset.addEventListener('click', async () => {
  if (confirm('¿Seguro que deseas reiniciar el progreso al principio (0)?')) {
    isRunning = false;
    isPaused = false;
    currentIndex = 0;
    await chrome.storage.local.remove(['syncIndex']);
    log('Progreso reiniciado a 0.', 'highlight');
    currentUrlDisplay.textContent = 'Progreso reiniciado. Haz clic en "Iniciar Sincronización".';
    statEta.textContent = '--:--';
    updateUI();
  }
});

btnScanBrowser.addEventListener('click', () => {
  if (isRunning) {
    alert('Por favor pausa la sincronización antes de escanear.');
    return;
  }
  scanBrowserHistory();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!Array.isArray(parsed)) {
        throw new Error('El archivo JSON debe contener un arreglo de objetos [ { url, title } ].');
      }
      urlList = parsed;
      sourceStatus.textContent = `Archivo subido: ${file.name} (${urlList.length.toLocaleString()} URLs)`;
      log(`Archivo ${file.name} cargado con éxito: ${urlList.length.toLocaleString()} URLs.`, 'success');
      currentIndex = 0;
      await chrome.storage.local.remove(['syncIndex']);
      updateUI();
    } catch (err) {
      alert(`Error al leer el archivo JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

speedSelect.addEventListener('change', () => {
  targetRate = parseInt(speedSelect.value, 10) || 40;
  log(`Velocidad ajustada a ~${targetRate} URLs/s.`);
});

btnClearLog.addEventListener('click', () => {
  terminal.innerHTML = '';
});

btnSyncInternals.addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'brave://sync-internals' });
});

btnSyncSettings.addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'brave://settings/braveSync' });
});

// Run init on page load
init();
