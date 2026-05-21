let metadata = null;
let currentSargaData = null;
let currentSarga = 2;
let currentShloka = 0;
let pendingShlokaNumber = null;
let appReady = false;
let hasDisplayedOnce = false;
const DATA_CACHE_BUST = '20250518';
const SCRIPT_STORAGE_KEY = 'yadavabhyudayam-script';
let scriptMode = localStorage.getItem(SCRIPT_STORAGE_KEY) || 'sanskrit';

function displayScript(devanagariText) {
    if (!devanagariText || scriptMode === 'sanskrit') return devanagariText;
    if (typeof Sanscript === 'undefined') return devanagariText;
    try {
        return Sanscript.t(devanagariText, 'devanagari', 'tamil');
    } catch {
        return devanagariText;
    }
}

function setScriptText(element, devanagariText) {
    element.dataset.sanskrit = devanagariText;
    element.textContent = displayScript(devanagariText);
}

function appendWordMeaningPair(row, { word, meaning }, isSecondPair) {
    const wordCell = document.createElement('td');
    const meaningCell = document.createElement('td');
    wordCell.className = isSecondPair ? 'word-cell pair-gap' : 'word-cell';
    meaningCell.className = 'meaning-cell';
    setScriptText(wordCell, word);
    meaningCell.textContent = meaning;
    row.appendChild(wordCell);
    row.appendChild(meaningCell);
}

function appendEmptyWordMeaningPair(row) {
    const wordCell = document.createElement('td');
    const meaningCell = document.createElement('td');
    wordCell.className = 'word-cell pair-gap empty-cell';
    meaningCell.className = 'meaning-cell empty-cell';
    wordCell.innerHTML = '&nbsp;';
    meaningCell.innerHTML = '&nbsp;';
    row.appendChild(wordCell);
    row.appendChild(meaningCell);
}

function updateScriptToggleUI() {
    const sanskritBtn = document.getElementById('btn-script-sanskrit');
    const tamilBtn = document.getElementById('btn-script-tamil');
    if (!sanskritBtn || !tamilBtn) return;

    const isTamil = scriptMode === 'tamil';
    sanskritBtn.classList.toggle('is-active', !isTamil);
    tamilBtn.classList.toggle('is-active', isTamil);
    sanskritBtn.setAttribute('aria-pressed', String(!isTamil));
    tamilBtn.setAttribute('aria-pressed', String(isTamil));
}

function refreshStaticScriptables() {
    document.querySelectorAll('.scriptable[data-sanskrit]').forEach((el) => {
        el.textContent = displayScript(el.dataset.sanskrit);
    });
}

function setScriptMode(mode) {
    if (mode !== 'sanskrit' && mode !== 'tamil') return;
    scriptMode = mode;
    localStorage.setItem(SCRIPT_STORAGE_KEY, scriptMode);
    document.body.classList.toggle('script-tamil', scriptMode === 'tamil');
    updateScriptToggleUI();
    refreshStaticScriptables();
    if (metadata) populateSargaSelect();
    if (appReady && currentSargaData) displayShloka();
}

function initScriptToggle() {
    document.body.classList.toggle('script-tamil', scriptMode === 'tamil');
    updateScriptToggleUI();
    refreshStaticScriptables();

    document.getElementById('btn-script-sanskrit')?.addEventListener('click', () => {
        setScriptMode('sanskrit');
    });
    document.getElementById('btn-script-tamil')?.addEventListener('click', () => {
        setScriptMode('tamil');
    });
}

async function loadMetadata() {
    const response = await fetch(`data/metadata.json?v=${DATA_CACHE_BUST}`);
    if (!response.ok) {
        throw new Error('Could not load metadata.json');
    }
    metadata = await response.json();
    resolveInitialSarga();
    populateSargaSelect();
}

function isSargaAvailable(sargaNumber) {
    const sarga = metadata?.sargas?.find((s) => s.number === sargaNumber);
    return Boolean(sarga && sarga.shlokaCount > 0);
}

function getFirstAvailableSarga() {
    const first = metadata?.sargas?.find((s) => s.shlokaCount > 0);
    return first?.number ?? 1;
}

function resolveInitialSarga() {
    if (!metadata) return;

    const hash = window.location.hash;
    if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const hashSarga = parseInt(params.get('sarga'), 10);
        if (!Number.isNaN(hashSarga) && !isSargaAvailable(hashSarga)) {
            currentSarga = getFirstAvailableSarga();
            pendingShlokaNumber = null;
            return;
        }
    }

    if (!isSargaAvailable(currentSarga)) {
        currentSarga = getFirstAvailableSarga();
        pendingShlokaNumber = null;
    }
}

function populateSargaSelect() {
    const select = document.getElementById('sarga-select');
    select.innerHTML = '';
    metadata.sargas.forEach((sarga) => {
        if (sarga.shlokaCount === 0) return;
        const option = document.createElement('option');
        option.value = String(sarga.number);
        option.textContent = `${sarga.nameEnglish} (${displayScript(sarga.name)}) — ${sarga.shlokaCount} shlokas`;
        select.appendChild(option);
    });
    select.value = String(currentSarga);
    select.onchange = (e) => {
        currentSarga = parseInt(e.target.value, 10);
        currentShloka = 0;
        pendingShlokaNumber = null;
        loadSarga(currentSarga);
    };
}

function findShlokaIndexByNumber(number) {
    if (!currentSargaData?.shlokas) return -1;
    return currentSargaData.shlokas.findIndex((s) => s.number === number);
}

function applyPendingShlokaIndex() {
    if (pendingShlokaNumber != null) {
        const idx = findShlokaIndexByNumber(pendingShlokaNumber);
        currentShloka = idx >= 0 ? idx : 0;
        pendingShlokaNumber = null;
    }
    const maxIndex = currentSargaData.shlokas.length - 1;
    if (currentShloka < 0 || currentShloka > maxIndex) {
        currentShloka = 0;
    }
}

async function loadSarga(sargaNumber) {
    appReady = false;
    setNavEnabled(false);

    const paddedNumber = String(sargaNumber).padStart(2, '0');
    const response = await fetch(`data/sarga-${paddedNumber}.json?v=${DATA_CACHE_BUST}`);
    if (!response.ok) {
        throw new Error(`Could not load sarga-${paddedNumber}.json`);
    }
    currentSargaData = await response.json();
    if (!currentSargaData.shlokas?.length) {
        const fallbackSarga = getFirstAvailableSarga();
        if (sargaNumber !== fallbackSarga) {
            currentSarga = fallbackSarga;
            pendingShlokaNumber = null;
            document.getElementById('sarga-select').value = String(currentSarga);
            return loadSarga(currentSarga);
        }
        throw new Error(`No shlokas in sarga-${paddedNumber}.json`);
    }

    applyPendingShlokaIndex();
    appReady = true;
    displayShloka();
    updateURL();
}

async function displayShloka() {
    const shloka = currentSargaData.shlokas[currentShloka];
    if (!shloka) return;

    document.getElementById('shloka-label').textContent =
        `${currentSargaData.nameEnglish} — Shloka ${shloka.number}`;

    await loadShlokaAudioPlayers(shloka.number);

    setScriptText(document.getElementById('shloka-sanskrit'), shloka.sanskrit);
    setScriptText(document.getElementById('shloka-anvaya'), shloka.anvaya);
    document.getElementById('shloka-translation').textContent = shloka.translation;

    const tbody = document.querySelector('#word-meanings-table tbody');
    tbody.innerHTML = '';
    const wordMeanings = shloka.wordMeanings || [];
    for (let i = 0; i < wordMeanings.length; i += 2) {
        const row = document.createElement('tr');
        appendWordMeaningPair(row, wordMeanings[i], false);
        if (wordMeanings[i + 1]) {
            appendWordMeaningPair(row, wordMeanings[i + 1], true);
        } else {
            appendEmptyWordMeaningPair(row);
        }
        tbody.appendChild(row);
    }

    updateNavigation();

    if (hasDisplayedOnce) {
        scrollToShlokaTop();
    }
    hasDisplayedOnce = true;
}

function getShlokaAudioPath(shlokaNumber) {
    const paddedSarga = String(currentSarga).padStart(2, '0');
    const paddedShloka = String(shlokaNumber).padStart(3, '0');
    return `audio/sarga-${paddedSarga}/${paddedShloka}.mp3`;
}

function getMeaningAudioPath(shlokaNumber) {
    const paddedSarga = String(currentSarga).padStart(2, '0');
    const paddedShloka = String(shlokaNumber).padStart(3, '0');
    return `audio/sarga-${paddedSarga}/${paddedShloka}-meaning.mp3`;
}

async function sniffAudioMime(path) {
    try {
        const url = new URL(path, window.location.href);
        const response = await fetch(url, { headers: { Range: 'bytes=0-11' } });
        if (!response.ok) return 'audio/mpeg';
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (
            bytes.length >= 8 &&
            bytes[4] === 0x66 &&
            bytes[5] === 0x74 &&
            bytes[6] === 0x79 &&
            bytes[7] === 0x70
        ) {
            return 'audio/mp4';
        }
        return 'audio/mpeg';
    } catch {
        return 'audio/mpeg';
    }
}

function setAudioPlayerSrc(audioEl, path, mimeType) {
    if (!audioEl || !path) return;
    audioEl.pause();
    const url = new URL(path, window.location.href);
    url.searchParams.set('player', audioEl.id);
    audioEl.removeAttribute('src');
    audioEl.innerHTML = '';
    const source = document.createElement('source');
    source.src = url.href;
    source.type = mimeType;
    audioEl.appendChild(source);
    audioEl.load();
}

async function loadShlokaAudioPlayers(shlokaNumber) {
    const shlokaAudio = document.getElementById('shloka-audio-shloka');
    const meaningAudio =
        document.getElementById('shloka-audio-meaning') ||
        document.getElementById('shloka-audio');

    const shlokaPath = getShlokaAudioPath(shlokaNumber);
    const meaningPath = getMeaningAudioPath(shlokaNumber);

    const [shlokaMime, meaningMime] = await Promise.all([
        sniffAudioMime(shlokaPath),
        sniffAudioMime(meaningPath),
    ]);

    if (shlokaAudio) {
        setAudioPlayerSrc(shlokaAudio, shlokaPath, shlokaMime);
    }
    if (meaningAudio) {
        setAudioPlayerSrc(meaningAudio, meaningPath, meaningMime);
    }
}

function scrollToShlokaTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setNavEnabled(enabled) {
    document.querySelectorAll('.nav-prev, .nav-next').forEach((btn) => {
        btn.disabled = !enabled;
    });
}

function updateNavigation() {
    const prevBtns = document.querySelectorAll('.nav-prev');
    const nextBtns = document.querySelectorAll('.nav-next');
    const indicators = document.querySelectorAll('.page-indicator');

    const firstSarga = metadata.sargas.find((s) => s.shlokaCount > 0)?.number ?? 1;
    const isFirst = currentShloka === 0 && currentSarga === firstSarga;
    const isLast =
        currentShloka === currentSargaData.shlokas.length - 1 &&
        currentSarga === getLastAvailableSarga();

    prevBtns.forEach((btn) => {
        btn.disabled = !appReady || isFirst;
    });
    nextBtns.forEach((btn) => {
        btn.disabled = !appReady || isLast;
    });

    const text = `${currentShloka + 1} / ${currentSargaData.shlokas.length}`;
    indicators.forEach((el) => {
        el.textContent = text;
    });
}

function getLastAvailableSarga() {
    const available = metadata.sargas.filter((s) => s.shlokaCount > 0);
    return available.length > 0 ? available[available.length - 1].number : getFirstAvailableSarga();
}

function goNext() {
    if (!appReady || !currentSargaData?.shlokas) return;

    if (currentShloka < currentSargaData.shlokas.length - 1) {
        currentShloka++;
        displayShloka();
        updateURL();
        return;
    }

    const nextSarga = metadata.sargas.find(
        (s) => s.number > currentSarga && s.shlokaCount > 0
    );
    if (nextSarga) {
        currentSarga = nextSarga.number;
        currentShloka = 0;
        pendingShlokaNumber = null;
        document.getElementById('sarga-select').value = String(currentSarga);
        loadSarga(currentSarga).catch(console.error);
    }
}

function goPrev() {
    if (!appReady || !currentSargaData?.shlokas) return;

    if (currentShloka > 0) {
        currentShloka--;
        displayShloka();
        updateURL();
        return;
    }

    const prevSarga = metadata.sargas
        .filter((s) => s.number < currentSarga && s.shlokaCount > 0)
        .pop();
    if (prevSarga) {
        currentSarga = prevSarga.number;
        pendingShlokaNumber = null;
        document.getElementById('sarga-select').value = String(currentSarga);
        loadSarga(currentSarga)
            .then(() => {
                currentShloka = currentSargaData.shlokas.length - 1;
                displayShloka();
                updateURL();
            })
            .catch(console.error);
    }
}

function updateURL() {
    const shloka = currentSargaData?.shlokas?.[currentShloka];
    if (!shloka) return;
    const hash = `#sarga=${currentSarga}&shloka=${shloka.number}`;
    history.replaceState(null, '', hash);
}

function parseURL() {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.substring(1));
    const sarga = parseInt(params.get('sarga'), 10);
    const shloka = parseInt(params.get('shloka'), 10);
    if (!Number.isNaN(sarga)) currentSarga = sarga;
    if (!Number.isNaN(shloka)) pendingShlokaNumber = shloka;
}

document.querySelectorAll('.nav-prev').forEach((btn) => {
    btn.addEventListener('click', goPrev);
});
document.querySelectorAll('.nav-next').forEach((btn) => {
    btn.addEventListener('click', goNext);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
});

initScriptToggle();

parseURL();
loadMetadata()
    .then(() => loadSarga(currentSarga))
    .catch((err) => console.error(err));
