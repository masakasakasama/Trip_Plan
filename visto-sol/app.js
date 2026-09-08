(() => {
  'use strict';

  const APP_KEY = 'trip-os-demo-v1';
  const COUNTRY_TOTAL = 195;
  const COUNTRY_META = {
    '036': { name: 'Australia', flag: '🇦🇺', currency: 'AUD', tz: 'Australia/Sydney', continent: 'Oceania' },
    '608': { name: 'Philippines', flag: '🇵🇭', currency: 'PHP', tz: 'Asia/Manila', continent: 'Asia' },
    '392': { name: 'Japan', flag: '🇯🇵', currency: 'JPY', tz: 'Asia/Tokyo', continent: 'Asia' },
    '276': { name: 'Germany', flag: '🇩🇪', currency: 'EUR', tz: 'Europe/Berlin', continent: 'Europe' },
    '250': { name: 'France', flag: '🇫🇷', currency: 'EUR', tz: 'Europe/Paris', continent: 'Europe' },
    '528': { name: 'Netherlands', flag: '🇳🇱', currency: 'EUR', tz: 'Europe/Amsterdam', continent: 'Europe' },
    '056': { name: 'Belgium', flag: '🇧🇪', currency: 'EUR', tz: 'Europe/Brussels', continent: 'Europe' },
    '616': { name: 'Poland', flag: '🇵🇱', currency: 'PLN', tz: 'Europe/Warsaw', continent: 'Europe' },
    '792': { name: 'Türkiye', flag: '🇹🇷', currency: 'TRY', tz: 'Europe/Istanbul', continent: 'Asia' },
    '764': { name: 'Thailand', flag: '🇹🇭', currency: 'THB', tz: 'Asia/Bangkok', continent: 'Asia' },
    '704': { name: 'Vietnam', flag: '🇻🇳', currency: 'VND', tz: 'Asia/Ho_Chi_Minh', continent: 'Asia' },
    '156': { name: 'China', flag: '🇨🇳', currency: 'CNY', tz: 'Asia/Shanghai', continent: 'Asia' },
    '410': { name: 'South Korea', flag: '🇰🇷', currency: 'KRW', tz: 'Asia/Seoul', continent: 'Asia' },
    '344': { name: 'Hong Kong', flag: '🇭🇰', currency: 'HKD', tz: 'Asia/Hong_Kong', continent: 'Asia' },
    '840': { name: 'United States', flag: '🇺🇸', currency: 'USD', tz: 'America/Los_Angeles', continent: 'North America' }
  };

  const CITY_GEO = {
    Sydney: [-33.8688,151.2093], Manila: [14.5995,120.9842], Tokyo: [35.6762,139.6503], Heidelberg: [49.3988,8.6724],
    Paris: [48.8566,2.3522], Versailles: [48.8049,2.1204], Bangkok: [13.7563,100.5018], Pattaya: [12.9236,100.8825],
    'Koh Larn': [12.924,100.787], Hanoi: [21.0278,105.8342], 'Ha Long Bay': [20.9101,107.1839], Seoul: [37.5665,126.978],
    Incheon: [37.4563,126.7052], Hongdae: [37.5563,126.9236], Gangnam: [37.4979,127.0276], Shanghai: [31.2304,121.4737],
    Istanbul: [41.0082,28.9784], Brussels: [50.8503,4.3517], Amsterdam: [52.3676,4.9041], Cologne: [50.9375,6.9603],
    Warsaw: [52.2297,21.0122], Krakow: [50.0647,19.945], Munich: [48.1351,11.582], Nordhausen: [51.5004,10.791],
    Nikko: [36.7199,139.6982], Kawagoe: [35.9251,139.4858], 'Frankfurt am Main': [50.1109,8.6821], 'Hong Kong': [22.3193,114.1694],
    Central: [22.2819,114.1589], 'Tsim Sha Tsui': [22.2988,114.1722], 'Los Angeles': [34.0522,-118.2437], 'Marina del Rey': [33.9803,-118.4517],
    Koreatown: [34.0618,-118.3006], 'Las Vegas': [36.1716,-115.1391], Melbourne: [-37.8136,144.9631], Brisbane: [-27.4698,153.0251],
    Perth: [-31.9523,115.8613], Canberra: [-35.2809,149.13], Kyoto: [35.0116,135.7681], Osaka: [34.6937,135.5023],
    Hiroshima: [34.3853,132.4553], Berlin: [52.52,13.405], Frankfurt: [50.1109,8.6821], London: [51.5072,-0.1276],
    Rome: [41.9028,12.4964], Singapore: [1.3521,103.8198], NewYork: [40.7128,-74.006], GuatemalaCity: [14.6349,-90.5069]
  };

  const NAME_TO_ID = Object.fromEntries(Object.entries(COUNTRY_META).map(([id, meta]) => [meta.name.toLowerCase(), id]));
  const state = { base: null, trips: [], selectedTripId: 'all', replayIndex: 0, replayTimer: null, world: [], globe: null, dataset: null };
  const $ = (selector) => document.querySelector(selector);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function fmtDate(date) {
    if (!date) return '日付未設定';
    try { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
    catch { return date; }
  }

  function dateRangeDays(a, b) {
    if (!a || !b) return 0;
    return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
  }

  function tripDateLabel(trip) {
    if (trip?.dateLabel) return trip.dateLabel;
    if (!trip?.startDate && !trip?.endDate) return '日付未設定';
    if (trip.startDate === trip.endDate) return fmtDate(trip.startDate);
    return `${fmtDate(trip.startDate)} → ${fmtDate(trip.endDate)}`;
  }

  function inferCountries(trip) {
    if (Array.isArray(trip?.countries) && trip.countries.length) return trip.countries;
    const text = `${trip?.destination || ''} ${trip?.title || ''}`.toLowerCase();
    return Object.values(COUNTRY_META).filter((meta) => text.includes(meta.name.toLowerCase())).map((meta) => meta.name);
  }

  function getCities(trip) {
    if (Array.isArray(trip?.cities) && trip.cities.length) return trip.cities;
    const values = new Set();
    (trip?.pois || []).forEach((poi) => { if (poi.area) values.add(String(poi.area).split(',')[0]); });
    if (trip?.destination) values.add(trip.destination);
    return [...values];
  }

  function mergeById(existing, incoming) {
    const out = Array.isArray(existing) ? existing : [];
    const ids = new Set(out.map((item) => item?.id).filter(Boolean));
    (Array.isArray(incoming) ? incoming : []).forEach((item) => {
      if (!item?.id || ids.has(item.id)) return;
      out.push(clone(item));
      ids.add(item.id);
    });
    return out;
  }

  function mergeHistorySeed(base) {
    const seeds = Array.isArray(window.TRIP_HISTORY_SEED) ? window.TRIP_HISTORY_SEED : [];
    const map = new Map(base.trips.map((trip) => [trip.id, trip]));
    seeds.forEach((seed) => {
      let trip = map.get(seed.id);
      if (!trip) {
        trip = clone(seed);
        base.trips.push(trip);
        map.set(trip.id, trip);
        return;
      }
      ['source','sourceUrl','dateLabel','durationDays','destination','status','cover'].forEach((key) => {
        if ((trip[key] === undefined || trip[key] === null || trip[key] === '') && seed[key] !== undefined) trip[key] = seed[key];
      });
      trip.countries = [...new Set([...(trip.countries || []), ...(seed.countries || [])])];
      trip.cities = [...new Set([...(trip.cities || []), ...(seed.cities || [])])];
      trip.pois = mergeById(trip.pois, seed.pois);
      trip.days = mergeById(trip.days, seed.days);
    });
    return base;
  }

  function fallbackBase() {
    return { schemaVersion: 3, trips: [{ id: 'demo-australia', title: 'Australia 2026', countries: ['Australia','Philippines'], cities: ['Sydney','Manila'], startDate: '2026-08-11', endDate: '2026-08-16', archived: false }] };
  }

  function loadTrips() {
    let base = null;
    try { base = JSON.parse(localStorage.getItem(APP_KEY) || 'null'); } catch {}
    if (!base || !Array.isArray(base.trips)) base = fallbackBase();
    base = mergeHistorySeed(clone(base));
    state.base = base;
    state.trips = base.trips.filter((trip) => !trip.archived).sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
  }

  function timeline() {
    return state.trips.map((trip, index) => ({ id: trip.id, trip, index, sortKey: trip.startDate || `9999-${index}` }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  function activeTrips() {
    const list = timeline();
    if (state.selectedTripId !== 'all') return list.filter((item) => item.id === state.selectedTripId).map((item) => item.trip);
    return list.slice(0, state.replayIndex + 1).map((item) => item.trip);
  }

  function buildDataset() {
    const trips = activeTrips();
    const countries = new Set();
    const pointMap = new Map();
    const arcs = [];

    trips.forEach((trip, tripIndex) => {
      inferCountries(trip).forEach((country) => countries.add(country));
      const cities = getCities(trip);
      cities.forEach((city, cityIndex) => {
        const geo = CITY_GEO[city];
        if (!geo) return;
        const point = pointMap.get(city) || { city, lat: geo[0], lng: geo[1], visits: 0, tripIds: [], tripTitles: [] };
        point.visits += 1;
        if (!point.tripIds.includes(trip.id)) point.tripIds.push(trip.id);
        if (!point.tripTitles.includes(trip.title)) point.tripTitles.push(trip.title);
        pointMap.set(city, point);
        if (cityIndex > 0) {
          const previous = CITY_GEO[cities[cityIndex - 1]];
          if (previous) arcs.push({ startLat: previous[0], startLng: previous[1], endLat: geo[0], endLng: geo[1], tripId: trip.id, tripTitle: trip.title, seq: cityIndex, tripIndex });
        }
      });
    });

    const countryNames = [...countries];
    const countryIds = countryNames.map((name) => NAME_TO_ID[String(name).toLowerCase()]).filter(Boolean);
    const points = [...pointMap.values()];
    return {
      trips,
      countryNames,
      countryIds,
      points,
      arcs,
      coverage: ((countryNames.length / COUNTRY_TOTAL) * 100).toFixed(1)
    };
  }

  async function loadWorld() {
    if (state.world.length) return;
    const [topology, table] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((response) => response.json()),
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.tsv').then((response) => response.text())
    ]);
    const names = new Map(d3.tsvParse(table).map((row) => [row.id, row.name]));
    state.world = topojson.feature(topology, topology.objects.countries).features;
    state.world.forEach((feature) => {
      feature.properties = feature.properties || {};
      feature.properties.name = names.get(feature.id) || String(feature.id);
      const id = String(feature.id).padStart(3, '0');
      if (!NAME_TO_ID[feature.properties.name.toLowerCase()]) NAME_TO_ID[feature.properties.name.toLowerCase()] = id;
    });
  }

  function tripColor(active) { return active ? '#ffd36b' : '#8fb8ff'; }

  function updateInfo(type = 'world', payload = null) {
    const title = $('#infoPanel h2');
    const desc = $('#infoPanel p');
    const list = $('#infoList');
    if (type === 'city') {
      title.textContent = `📍 ${payload.city}`;
      desc.textContent = `${payload.visits}回訪問`;
      list.innerHTML = `<div class="info-row"><span>Trip</span><b>${payload.tripTitles.join('、')}</b></div><div class="info-row"><span>座標</span><b>${payload.lat.toFixed(2)}, ${payload.lng.toFixed(2)}</b></div>`;
      return;
    }
    if (type === 'trip') {
      title.textContent = `🧳 ${payload.title}`;
      desc.textContent = tripDateLabel(payload);
      list.innerHTML = `<div class="info-row"><span>国</span><b>${inferCountries(payload).join('、') || 'なし'}</b></div><div class="info-row"><span>都市</span><b>${getCities(payload).join('、') || 'なし'}</b></div>`;
      return;
    }
    if (type === 'country') {
      title.textContent = `${payload.flag || '🌐'} ${payload.name}`;
      desc.textContent = `${payload.related.length}件のTrip`;
      list.innerHTML = `<div class="info-row"><span>通貨</span><b>${payload.currency || '不明'}</b></div><div class="info-row"><span>TZ</span><b>${payload.tz || '不明'}</b></div><div class="info-row"><span>Trip</span><b>${payload.related.map((trip) => trip.title).join('、') || 'なし'}</b></div>`;
      return;
    }
    const data = state.dataset;
    title.textContent = '世界全体';
    desc.textContent = 'ドラッグで回転、ピンチでズーム、国や都市をタップするとフォーカスします';
    list.innerHTML = `<div class="info-row"><span>Trip</span><b>${data?.trips.length || 0}件</b></div><div class="info-row"><span>都市</span><b>${data?.points.length || 0}都市</b></div><div class="info-row"><span>訪問国</span><b>${data?.countryNames.length || 0}か国</b></div>`;
  }

  function renderFilters() {
    const items = [{ id: 'all', title: 'すべての旅' }, ...timeline().map((item) => ({ id: item.id, title: item.trip.title }))];
    $('#tripFilters').innerHTML = items.map((item) => `<button class="filter-chip ${state.selectedTripId === item.id ? 'active' : ''}" data-filter="${item.id}">${item.title}</button>`).join('');
    document.querySelectorAll('[data-filter]').forEach((button) => button.onclick = () => {
      stopReplay();
      state.selectedTripId = button.dataset.filter;
      state.replayIndex = Math.max(0, timeline().length - 1);
      refresh();
      if (state.selectedTripId !== 'all') focusTrip(state.selectedTripId);
    });
  }

  function renderStats() {
    const data = state.dataset;
    $('#countryCount').textContent = data.countryNames.length;
    $('#tripCount').textContent = data.trips.length;
    $('#cityCount').textContent = data.points.length;
    $('#routeCount').textContent = data.arcs.length;
    $('#coverage').textContent = `${data.coverage}%`;
    $('#heroSub').textContent = `${data.trips.length} trips、${data.points.length} cities、${data.arcs.length} routes`;
  }

  function renderLists() {
    const data = state.dataset;
    $('#tripListMeta').textContent = `${data.trips.length}件`;
    $('#tripList').innerHTML = data.trips.map((trip) => `<article class="trip-item"><button data-trip="${trip.id}"><div class="trip-title-row"><div class="trip-title">${trip.title}</div><span class="small-pill">${dateRangeDays(trip.startDate, trip.endDate) || '-'} days</span></div><div class="trip-date">${tripDateLabel(trip)}</div><div class="trip-badges">${inferCountries(trip).map((country) => `<span class="small-pill">${country}</span>`).join('')}</div><div class="trip-meta">${getCities(trip).join(' · ') || '都市情報なし'}</div></button></article>`).join('') || '<div class="empty">Tripなし</div>';
    document.querySelectorAll('[data-trip]').forEach((button) => button.onclick = () => {
      stopReplay(); state.selectedTripId = button.dataset.trip; refresh(); focusTrip(button.dataset.trip);
    });

    $('#cityListMeta').textContent = `${data.points.length}都市`;
    $('#cityList').innerHTML = data.points.map((point) => `<article class="city-item"><button data-city="${point.city}"><div class="city-title-row"><div class="trip-title">${point.city}</div><span class="small-pill">${point.visits}回</span></div><div class="city-sub">${point.tripTitles.join('、')}</div></button></article>`).join('') || '<div class="empty">都市なし</div>';
    document.querySelectorAll('[data-city]').forEach((button) => button.onclick = () => {
      const point = state.dataset.points.find((item) => item.city === button.dataset.city);
      if (point) { focus(point.lat, point.lng, 0.9); updateInfo('city', point); }
    });
  }

  function renderReplay() {
    const slider = $('#replaySlider');
    const list = timeline();
    if (state.selectedTripId !== 'all') {
      slider.disabled = true; slider.min = 0; slider.max = 0; slider.value = 0; $('#replayLabel').textContent = '選択中のTripのみ表示'; return;
    }
    slider.disabled = false;
    slider.min = 0;
    slider.max = Math.max(0, list.length - 1);
    state.replayIndex = Math.min(state.replayIndex, Math.max(0, list.length - 1));
    slider.value = state.replayIndex;
    const current = list[state.replayIndex];
    $('#replayLabel').textContent = current ? `${tripDateLabel(current.trip)} まで` : 'Tripなし';
  }

  function focus(lat, lng, altitude = 1.6, duration = 1000) {
    state.globe?.pointOfView({ lat, lng, altitude }, duration);
  }

  function focusTrip(id) {
    const trip = state.trips.find((item) => item.id === id);
    if (!trip) return;
    const first = CITY_GEO[getCities(trip)[0]];
    if (first) focus(first[0], first[1], 1.05, 1200);
    updateInfo('trip', trip);
  }

  function polygonCap(feature) {
    const id = String(feature.id).padStart(3, '0');
    if (state.dataset.countryIds.includes(id)) return state.selectedTripId === 'all' ? 'rgba(90,137,255,.86)' : 'rgba(255,211,107,.9)';
    return 'rgba(22,39,63,.72)';
  }

  function polygonAltitude(feature) {
    const id = String(feature.id).padStart(3, '0');
    return state.dataset.countryIds.includes(id) ? 0.018 : 0.002;
  }

  function pointColor(point) {
    const active = state.selectedTripId !== 'all' && point.tripIds.includes(state.selectedTripId);
    return tripColor(active);
  }

  function arcColor(arc) {
    const active = state.selectedTripId !== 'all' && arc.tripId === state.selectedTripId;
    return active ? ['rgba(255,211,107,.96)','rgba(255,211,107,.18)'] : ['rgba(116,185,255,.9)','rgba(116,185,255,.12)'];
  }

  function refreshGlobe() {
    if (!state.globe) return;
    state.globe
      .polygonsData(state.world)
      .pointsData(state.dataset.points)
      .arcsData(state.dataset.arcs)
      .labelsData(state.dataset.points.filter((point) => point.visits > 1 || state.selectedTripId !== 'all').map((point) => ({ ...point, text: point.city })));
  }

  function refresh() {
    state.dataset = buildDataset();
    renderFilters(); renderStats(); renderLists(); renderReplay(); refreshGlobe();
    if (state.selectedTripId === 'all') updateInfo();
  }

  function startReplay() {
    if (state.selectedTripId !== 'all') return;
    const list = timeline();
    if (!list.length) return;
    if (state.replayIndex >= list.length - 1) state.replayIndex = 0;
    $('#replayToggle').textContent = '停止';
    refresh();
    state.replayTimer = setInterval(() => {
      if (state.replayIndex >= list.length - 1) { stopReplay(); return; }
      state.replayIndex += 1;
      refresh();
      focusTrip(list[state.replayIndex].id);
    }, 1800);
  }

  function stopReplay() {
    if (state.replayTimer) clearInterval(state.replayTimer);
    state.replayTimer = null;
    $('#replayToggle').textContent = '再生';
  }

  function wireControls() {
    $('#zoomIn').onclick = () => { const p = state.globe?.pointOfView(); if (p) state.globe.pointOfView({ ...p, altitude: Math.max(.55, p.altitude * .82) }, 450); };
    $('#zoomOut').onclick = () => { const p = state.globe?.pointOfView(); if (p) state.globe.pointOfView({ ...p, altitude: Math.min(3.4, p.altitude * 1.18) }, 450); };
    $('#resetView').onclick = () => { stopReplay(); state.selectedTripId = 'all'; state.replayIndex = Math.max(0, timeline().length - 1); refresh(); focus(20,130,2.15,1100); };
    $('#replaySlider').oninput = (event) => { stopReplay(); state.replayIndex = Number(event.target.value || 0); refresh(); };
    $('#replayToggle').onclick = () => state.replayTimer ? stopReplay() : startReplay();
  }

  async function initGlobe() {
    await loadWorld();
    const el = $('#globeViz');
    const globe = Globe()(el)
      .width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#8ebcff')
      .atmosphereAltitude(.17)
      .polygonCapColor(polygonCap)
      .polygonSideColor(() => 'rgba(6,12,22,.18)')
      .polygonStrokeColor(() => 'rgba(150,188,255,.18)')
      .polygonAltitude(polygonAltitude)
      .polygonLabel((feature) => `<div class="country-tooltip"><b>${feature.properties?.name || 'Country'}</b>${state.dataset.countryIds.includes(String(feature.id).padStart(3,'0')) ? '訪問済み' : '未訪問'}</div>`)
      .onPolygonClick((feature) => {
        const center = d3.geoCentroid(feature); focus(center[1], center[0], 1.35, 1100);
        const id = String(feature.id).padStart(3,'0');
        const name = feature.properties?.name || 'Country';
        const meta = COUNTRY_META[id] || {};
        const related = state.dataset.trips.filter((trip) => inferCountries(trip).some((country) => NAME_TO_ID[String(country).toLowerCase()] === id));
        updateInfo('country', { name, flag: meta.flag, currency: meta.currency, tz: meta.tz, related });
      })
      .pointColor(pointColor)
      .pointAltitude(() => .045)
      .pointRadius((point) => point.visits > 1 ? .34 : .28)
      .pointLabel((point) => `<div class="country-tooltip"><b>${point.city}</b>${point.tripTitles.join('、')}</div>`)
      .onPointClick((point) => { focus(point.lat, point.lng, .88, 950); updateInfo('city', point); })
      .labelText('text')
      .labelSize(() => 1.0)
      .labelDotRadius(.14)
      .labelColor(pointColor)
      .labelResolution(2)
      .arcColor(arcColor)
      .arcAltitude((arc) => .15 + (arc.seq % 3) * .045)
      .arcStroke(() => .75)
      .arcDashLength(.55)
      .arcDashGap(.75)
      .arcDashAnimateTime(2200)
      .arcLabel((arc) => `<div class="country-tooltip"><b>${arc.tripTitle}</b>移動ルート</div>`)
      .pointOfView({ lat: 20, lng: 130, altitude: 2.15 }, 0);

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = .42;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.rotateSpeed = .8;
    controls.zoomSpeed = .9;

    state.globe = globe;
    window.addEventListener('resize', () => { globe.width(el.clientWidth); globe.height(el.clientHeight); });
  }

  async function init() {
    loadTrips();
    state.replayIndex = Math.max(0, timeline().length - 1);
    wireControls();
    state.dataset = buildDataset();
    await initGlobe();
    refresh();
  }

  init().catch((error) => {
    console.error('visto-sol failed', error);
    $('#heroSub').textContent = '読み込みに失敗しました';
    $('#tripList').innerHTML = `<div class="empty">${String(error?.message || error)}</div>`;
  });
})();
