const CONFIG = { lang: 'en', clock: 'local', max: 15, stopId: "NSR:StopPlace:4000", stopName: "Oslo S" };
const stats = { calls: 0, latency: 0, trains: 0, buses: 0, startTime: Date.now() };
let refreshTimer = 30;
let favorites = JSON.parse(localStorage.getItem('nordic_favs') || '[]');

const i18n = {
    en: {
        time: "Time", line: "Line", dest: "Destination", status: "Status",
        ontime: "ON TIME", late: "LATE", favs: "FAVORITES", analytics: "ANALYTICS", config: "CONFIG",
        saved: "Saved Stations", close: "CLOSE", settings: "Settings", lang: "Language",
        clock: "Clock Mode", max: "Max Entries", save: "SAVE & EXIT", saveBtn: "SAVE", savedBtn: "SAVED"
    },
    no: {
        time: "Tid", line: "Linje", dest: "Destinasjon", status: "Status",
        ontime: "I RUTE", late: "FORSINKET", favs: "FAVORITTER", analytics: "ANALYSE", config: "OPPSETT",
        saved: "Lagrede Stasjoner", close: "LUKK", settings: "Innstillinger", lang: "Språk",
        clock: "Klokkemodus", max: "Maks Linjer", save: "LAGRE & LUKK", saveBtn: "LAGRE", savedBtn: "LAGRET"
    }
};

function applyTranslations() {
    const t = i18n[CONFIG.lang];
    document.getElementById('h-time').textContent = t.time;
    document.getElementById('h-line').textContent = t.line;
    document.getElementById('h-dest').textContent = t.dest;
    document.getElementById('h-status').textContent = t.status;
    document.getElementById('f-favs').textContent = t.favs;
    document.getElementById('f-stats').textContent = t.analytics;
    document.getElementById('f-config').textContent = t.config;
    document.getElementById('m-fav-title').textContent = t.saved;
    document.getElementById('m-fav-close').textContent = t.close;
    document.getElementById('m-stat-close').textContent = t.close;
    document.getElementById('m-stat-title').textContent = t.analytics;
    document.getElementById('m-set-title').textContent = t.settings;
    document.getElementById('s-lang').textContent = t.lang;
    document.getElementById('s-clock').textContent = t.clock;
    document.getElementById('s-max').textContent = t.max;
    document.getElementById('m-set-save').textContent = t.save;
    updateFavUI();
}

function updateFavUI() {
    const btn = document.getElementById('fav-toggle-btn');
    const isFav = favorites.some(f => f.id === CONFIG.stopId);
    btn.textContent = isFav ? `★ ${i18n[CONFIG.lang].savedBtn}` : `☆ ${i18n[CONFIG.lang].saveBtn}`;
    btn.className = isFav ? 'is-fav' : '';
}

function removeFavorite(id, event) {
    event.stopPropagation();
    favorites = favorites.filter(f => f.id !== id);
    localStorage.setItem('nordic_favs', JSON.stringify(favorites));
    openFavs();
    updateFavUI();
}

function toggleFavoriteCurrent() {
    const idx = favorites.findIndex(f => f.id === CONFIG.stopId);
    if (idx > -1) favorites.splice(idx, 1);
    else favorites.push({ id: CONFIG.stopId, name: CONFIG.stopName });
    localStorage.setItem('nordic_favs', JSON.stringify(favorites));
    updateFavUI();
}

function openFavs() {
    const list = document.getElementById('fav-list');
    list.innerHTML = favorites.length ? '' : '<div style="color:#666; padding:20px; text-align:center;">Empty</div>';
    favorites.forEach(f => {
        const div = document.createElement('div');
        div.className = 'fav-item';
        div.innerHTML = `<div><b>${f.name}</b><br><small style="color:#666">${f.id}</small></div><div class="del-btn" onclick="removeFavorite('${f.id}', event)">×</div>`;
        div.onclick = () => {
            CONFIG.stopId = f.id; CONFIG.stopName = f.name;
            document.getElementById('active-station-name').textContent = f.name;
            refreshBoard(); toggleModal('fav-modal'); updateFavUI();
        };
        list.appendChild(div);
    });
    toggleModal('fav-modal');
}

setInterval(() => {
    const now = new Date();
    const timeStr = CONFIG.clock === 'no'
    ? now.toLocaleTimeString('en-GB', {timeZone: 'Europe/Oslo', hour12: false})
    : now.toLocaleTimeString('en-GB', {hour12: false});
    document.getElementById('current-time').textContent = timeStr;
    refreshTimer--;
    document.getElementById('refresh-progress').style.width = `${((30-refreshTimer)/30)*100}%`;
    if (refreshTimer <= 0) { refreshBoard(); refreshTimer = 30; }
}, 1000);

async function refreshBoard() {
    const start = performance.now();
    const query = `{ stopPlace(id: "${CONFIG.stopId}") { estimatedCalls(numberOfDepartures: ${CONFIG.max}) { expectedDepartureTime aimedDepartureTime destinationDisplay { frontText } quay { publicCode id } serviceJourney { id journeyPattern { line { publicCode transportMode } } } } } }`;
    try {
        const res = await fetch("https://api.entur.io/journey-planner/v3/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json", "ET-Client-Name": "aeromicro-v4" },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        stats.latency = Math.round(performance.now() - start);
        stats.calls++;
        render(data.data.stopPlace.estimatedCalls);
    } catch (e) { console.error(e); }
}

function render(calls) {
    const container = document.getElementById('board-content');
    container.innerHTML = '';
    let currentTrains = 0;
    let currentBuses = 0;

    calls.forEach(call => {
        const mode = call.serviceJourney.journeyPattern.line.transportMode;
        mode === 'rail' ? currentTrains++ : currentBuses++;

        // Global stat tracking
        stats.trains = Math.max(stats.trains, currentTrains);
        stats.buses = Math.max(stats.buses, currentBuses);

        const expected = new Date(call.expectedDepartureTime);
        const aimed = new Date(call.aimedDepartureTime);
        const delay = Math.round((expected - aimed) / 60000);

        const row = document.createElement('div');
        row.className = 'board-row';
        row.onclick = () => showNerdy(call);

        // Logic for status: Always shows ON TIME or +Xm LATE
        const statusLabel = delay > 0 ? `+${delay}m ${i18n[CONFIG.lang].late}` : i18n[CONFIG.lang].ontime;
        const statusClass = delay > 0 ? 'color:#ff4444' : 'color:#00ff88';

        // Mode label styling
        const modeLabel = mode === 'rail' ? 'TRAIN' : 'BUS';

        row.innerHTML = `
        <div class="board-time">${expected.getHours()}:${expected.getMinutes().toString().padStart(2,'0')}</div>
        <div><span class="tag">${call.serviceJourney.journeyPattern.line.publicCode || '–'}</span></div>
        <div class="board-dest">
        <span style="font-size:0.6rem; color:#666; vertical-align:middle; margin-right:5px;">[${modeLabel}]</span>
        ${call.destinationDisplay.frontText}
        </div>
        <div class="status-cell" style="${statusClass}">${statusLabel}</div>
        `;
        container.appendChild(row);
    });
}

function showNerdy(call) {
    document.getElementById('nerdy-content').innerHTML = `
    <div class="nerdy-line">ID: ${call.serviceJourney.id}</div>
    <div class="nerdy-line">MODE: ${call.serviceJourney.journeyPattern.line.transportMode.toUpperCase()}</div>
    <div class="nerdy-line">QUAY: ${call.quay?.id}</div>
    `;
    toggleModal('nerdy-modal');
}

function updateSettings() {
    CONFIG.lang = document.getElementById('set-lang').value;
    CONFIG.clock = document.getElementById('set-clock').value;
    CONFIG.max = document.getElementById('set-max').value;
    document.getElementById('max-val').textContent = CONFIG.max;
    applyTranslations();
    refreshBoard();
}

function toggleModal(id) {
    const m = document.getElementById(id);
    m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
    if (id === 'stats-modal') {
        const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
        document.getElementById('stats-body').innerHTML = `
        <div class="setting-row"><span>API Latency</span><span>${stats.latency}ms</span></div>
        <div class="setting-row"><span>Total Requests</span><span>${stats.calls}</span></div>
        <div class="setting-row"><span>Max Trains Visible</span><span>${stats.trains}</span></div>
        <div class="setting-row"><span>Max Buses Visible</span><span>${stats.buses}</span></div>
        <div class="setting-row"><span>Session Uptime</span><span>${uptime}s</span></div>
        <div class="setting-row"><span>Platform</span><span>${navigator.platform}</span></div>
        `;
    }
}

document.getElementById('station-input').oninput = async (e) => {
    if (e.target.value.length < 3) return;
    const res = await fetch(`https://api.entur.io/geocoder/v1/autocomplete?text=${e.target.value}&layers=venue&size=5`);
    const data = await res.json();
    const box = document.getElementById('suggestions');
    box.innerHTML = '';
    data.features.forEach(f => {
        const d = document.createElement('div');
        d.style.padding = '10px'; d.style.cursor = 'pointer';
        d.textContent = f.properties.name;
        d.onclick = () => {
            CONFIG.stopId = f.properties.id; CONFIG.stopName = f.properties.name;
            document.getElementById('active-station-name').textContent = f.properties.name;
            refreshBoard(); box.style.display='none'; updateFavUI();
        };
        box.appendChild(d);
    });
    box.style.display = 'block';
};

document.getElementById('active-station-name').textContent = CONFIG.stopName;
applyTranslations();
refreshBoard();
