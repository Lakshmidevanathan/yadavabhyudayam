let metadata = null;
let currentSargaData = null;
let currentSarga = 1;
let currentShloka = 0;
let pendingShlokaNumber = null;
let appReady = false;
let hasDisplayedOnce = false;
let currentAudioPlaylist = [];
let currentAudioPartIndex = 0;
const MAX_AUDIO_PARTS = 99;
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
    const response = await fetch('data/metadata.json');
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
    const response = await fetch(`data/sarga-${paddedNumber}.json`);
    if (!response.ok) {
        throw new Error(`Could not load sarga-${paddedNumber}.json`);
    }
    currentSargaData = await response.json();
    if (!currentSargaData.shlokas?.length) {
        throw new Error(`No shlokas in sarga-${paddedNumber}.json`);
    }

    applyPendingShlokaIndex();
    appReady = true;
    displayShloka();
    updateURL();
}

function displayShloka() {
    const shloka = currentSargaData.shlokas[currentShloka];
    if (!shloka) return;

    document.getElementById('shloka-label').textContent =
        `${currentSargaData.nameEnglish} — Shloka ${shloka.number}`;

    setupAudioPlaylist(shloka.number);

    setScriptText(document.getElementById('shloka-sanskrit'), shloka.sanskrit);
    setScriptText(document.getElementById('shloka-padaccheda'), shloka.padaccheda);
    setScriptText(document.getElementById('shloka-anvaya'), shloka.anvaya);
    document.getElementById('shloka-translation').textContent = shloka.translation;

    const tbody = document.querySelector('#word-meanings-table tbody');
    tbody.innerHTML = '';
    (shloka.wordMeanings || []).forEach(({ word, meaning }) => {
        const row = document.createElement('tr');
        const wordCell = document.createElement('td');
        const meaningCell = document.createElement('td');
        setScriptText(wordCell, word);
        meaningCell.textContent = meaning;
        row.appendChild(wordCell);
        row.appendChild(meaningCell);
        tbody.appendChild(row);
    });

    updateNavigation();

    if (hasDisplayedOnce) {
        scrollToShlokaTop();
    }
    hasDisplayedOnce = true;
}

function getAudioBasePath(paddedSarga, paddedShloka) {
    return `audio/sarga-${paddedSarga}/${paddedShloka}`;
}

async function audioFileExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch {
        return false;
    }
}

async function discoverAudioPlaylist(shlokaNumber) {
    const paddedSarga = String(currentSarga).padStart(2, '0');
    const paddedShloka = String(shlokaNumber).padStart(3, '0');
    const base = getAudioBasePath(paddedSarga, paddedShloka);
    const playlist = [];

    for (let part = 1; part <= MAX_AUDIO_PARTS; part++) {
        const paddedPart = String(part).padStart(3, '0');
        const path = `${base}-${paddedPart}.mp3`;
        if (!(await audioFileExists(path))) break;
        playlist.push(path);
    }

    if (playlist.length === 0) {
        const singleFile = `${base}.mp3`;
        if (await audioFileExists(singleFile)) {
            playlist.push(singleFile);
        }
    }

    return playlist;
}

function updateAudioPartIndicator() {
    const indicator = document.getElementById('audio-part-indicator');
    const partNav = document.getElementById('audio-part-nav');
    const partPrevBtns = document.querySelectorAll('.audio-part-prev');
    const partNextBtns = document.querySelectorAll('.audio-part-next');

    const hasMultipleParts = currentAudioPlaylist.length > 1;

    if (partNav) {
        partNav.hidden = !hasMultipleParts;
    }

    if (indicator) {
        indicator.textContent = hasMultipleParts
            ? `Part ${currentAudioPartIndex + 1} / ${currentAudioPlaylist.length}`
            : '';
    }

    const isFirstPart = currentAudioPartIndex === 0;
    const isLastPart = currentAudioPartIndex >= currentAudioPlaylist.length - 1;

    partPrevBtns.forEach((btn) => {
        btn.disabled = !hasMultipleParts || isFirstPart;
    });
    partNextBtns.forEach((btn) => {
        btn.disabled = !hasMultipleParts || isLastPart;
    });
}

function goAudioPartPrev() {
    if (currentAudioPartIndex <= 0) return;
    currentAudioPartIndex--;
    playCurrentAudioPart(true);
}

function goAudioPartNext() {
    if (currentAudioPartIndex >= currentAudioPlaylist.length - 1) return;
    currentAudioPartIndex++;
    playCurrentAudioPart(true);
}

function playCurrentAudioPart(autoplay = false) {
    const audioEl = document.getElementById('shloka-audio');
    const audioSource = document.getElementById('audio-source');

    if (!currentAudioPlaylist.length) {
        audioSource.removeAttribute('src');
        audioEl.load();
        updateAudioPartIndicator();
        return;
    }

    audioSource.src = currentAudioPlaylist[currentAudioPartIndex];
    audioEl.load();
    updateAudioPartIndicator();

    if (autoplay) {
        audioEl.play().catch(() => {});
    }
}

function onAudioPartEnded() {
    if (currentAudioPartIndex < currentAudioPlaylist.length - 1) {
        currentAudioPartIndex++;
        playCurrentAudioPart(true);
    }
}

async function setupAudioPlaylist(shlokaNumber) {
    const audioEl = document.getElementById('shloka-audio');
    audioEl.pause();

    currentAudioPlaylist = await discoverAudioPlaylist(shlokaNumber);
    currentAudioPartIndex = 0;
    playCurrentAudioPart();
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

const shlokaAudio = document.getElementById('shloka-audio');
if (shlokaAudio) {
    shlokaAudio.addEventListener('ended', onAudioPartEnded);
}

document.querySelectorAll('.audio-part-prev').forEach((btn) => {
    btn.addEventListener('click', goAudioPartPrev);
});
document.querySelectorAll('.audio-part-next').forEach((btn) => {
    btn.addEventListener('click', goAudioPartNext);
});

initScriptToggle();

parseURL();
loadMetadata()
    .then(() => loadSarga(currentSarga))
    .catch((err) => console.error(err));
