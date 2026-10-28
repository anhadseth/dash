(() => {
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = new URLSearchParams(location.search).has("demo");
const REDIRECT = location.origin + location.pathname;

/* ======================= Settings (saved on this iPad only) ======================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem("dash." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dash." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("dash." + k); } catch {} }
};
const S = {
  home: store.get("home", ""), p2Name: store.get("p2Name", "UBC"), p2Addr: store.get("p2Addr", "University of British Columbia, Vancouver, BC"),
  people: store.get("people", [{ name: "Mom", num: "" }, { name: "Dad", num: "" }, { name: "", num: "" }]),
  auto: store.get("auto", true), chime: store.get("chime", true), manual: store.get("manual", 50),
  theme: store.get("theme", "auto"), standby: store.get("standby", 30), mono: store.get("mono", false),
  spId: store.get("spId", ""), gKey: store.get("gKey", ""),
  lastLat: store.get("lastLat", null), lastLon: store.get("lastLon", null)
};
const save = (k, v) => { S[k] = v; store.set(k, v); };

if (DEMO) Object.assign(S, {
  home: "9235 Hardy Rd, Delta, BC", people: [{ name: "Mom", num: "6045550101" }, { name: "Dad", num: "6045550102" }, { name: "Jay", num: "6045550103" }],
  lastLat: 49.2606, lastLon: -123.246
});

/* ======================= Helpers ======================= */
let toastT;
function toast(msg, ms = 2800) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms); }
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const R = 6371000;
function dist(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function openURL(u) { location.href = u; }
const hm = (d) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
const hr12 = (d) => `${d.getHours() % 12 || 12}${d.getHours() < 12 ? "AM" : "PM"}`;
const isStandalone = () => navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

/* ======================= Layout: wide vs side panel ======================= */
function layout() { document.body.classList.toggle("narrow", innerWidth < 760); }
addEventListener("resize", () => { layout(); if (map) google.maps.event.trigger(map, "resize"); });
layout();

/* status circles into every slot */
$$(".stat-slot").forEach(s => s.appendChild($("#statTpl").content.cloneNode(true)));

/* ======================= Theme (sunrise / sunset) ======================= */
function sunTimes(date, lat, lng) {
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
  const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const lw = rad * -lng, phi = rad * lat, e = rad * 23.4397;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jt = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const a = 0.0009 + (w + lw) / (2 * Math.PI) + n;
  const Js = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const toD = (j) => new Date((j + 0.5 - J1970) * dayMs);
  return { rise: toD(Jt - (Js - Jt)), set: toD(Js) };
}
const sysDark = matchMedia("(prefers-color-scheme: dark)");
function theme() {
  if (S.theme !== "auto") return S.theme;
  if (S.lastLat != null) {
    const now = new Date(), t = sunTimes(now, S.lastLat, S.lastLon);
    if (!isNaN(t.rise) && !isNaN(t.set)) return now >= t.rise && now < t.set ? "light" : "dark";
  }
  return sysDark.matches ? "dark" : "light";
}
let curTheme = null;
function applyTheme() {
  const t = theme();
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').content = t === "dark" ? "#000000" : "#ffffff";
  $$("#themeSeg button").forEach(b => b.classList.toggle("on", b.dataset.v === S.theme));
  if (t !== curTheme) { curTheme = t; styleMap(); }
}
sysDark.addEventListener?.("change", applyTheme);

/* ======================= Clock + date ======================= */
function tick() {
  const now = new Date();
  const time = hm(now);
  const short = `${["SUN","MON","TUE","WED","THU","FRI","SAT"][now.getDay()]} ${now.getDate()}`;
  ["#time", "#timeTop"].forEach(s => $(s).textContent = time);
  ["#date", "#dateTop"].forEach(s => $(s).textContent = short);
  if ($("#clock").textContent !== time) { $("#clock").textContent = time; fitClock(); }
  $("#startClock").textContent = time;
  $("#sbDay").textContent = now.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  $("#sbDate").textContent = now.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fitClock() {
  const el = $("#clock"); if ($("#standby").hidden) return;
  el.style.fontSize = "";
  const avail = el.parentElement.clientWidth - 300 - 28 - 72;
  const w = el.getBoundingClientRect().width;
  if (w > avail) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * avail / w) + "px";
}
addEventListener("resize", fitClock);
tick(); setInterval(tick, 1000 * 5);

/* ======================= Sound: one soft chime ======================= */
let actx = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0);
  } catch {}
}
function chime() {
  if (!S.chime || !actx) return;
  if (actx.state === "suspended") actx.resume();
  const t0 = actx.currentTime + 0.02;
  [[1046.5, 0], [1318.5, 0.16]].forEach(([f, dt]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.9);
    o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + 1);
  });
}

/* ======================= Keep the screen awake ======================= */
async function keepAwake() { try { if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen"); } catch {} }

/* ======================= Speed + GPS ======================= */
let started = false, last = null, lastFixAt = 0, lastAcc = Infinity, pos = null, speedKmh = 0, armed = true, wasOver = false;
function onPosition(p) {
  const c = p.coords, now = p.timestamp || Date.now();
  const fix = { lat: c.latitude, lon: c.longitude, t: now };
  lastFixAt = Date.now(); lastAcc = c.accuracy; pos = fix;
  const good = c.accuracy <= 25;
  let v = (c.speed != null && c.speed >= 0) ? c.speed * 3.6 : null;
  if (v == null && last && good) { const dt = (now - last.t) / 1000; if (dt > 0.5) v = dist(last, fix) / dt * 3.6; }
  v = v == null || v < 2 ? 0 : v;
  speedKmh = v;
  if (good || !last) last = fix;
  if (S.lastLat == null || Math.abs(S.lastLat - fix.lat) > 0.05 || Math.abs(S.lastLon - fix.lon) > 0.05) { save("lastLat", fix.lat); save("lastLon", fix.lon); applyTheme(); }
  lookupLimit(fix, v);
  weatherMaybe();
  updateMe();
  renderSpeed();
}
function onPosError(e) { if (e.code === 1) toast("Location is off for this app. Turn it on in Settings > Privacy > Location Services.", 6000); renderSpeed(); }

/* speed limit: OpenStreetMap with manual fallback */
const lim = { v: null, at: 0, busy: false, lastAt: 0, lastPos: null };
const RANK = { motorway: 1, trunk: 2, primary: 3, secondary: 4, tertiary: 5, motorway_link: 6, trunk_link: 6, primary_link: 6, secondary_link: 7, tertiary_link: 7, unclassified: 8, residential: 9, living_street: 10, service: 11 };
function parseMax(s, hw) {
  if (s) {
    s = String(s).split(";")[0].trim();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
    if (m) { let v = +m[1]; if (m[2] && /mph/i.test(m[2])) v = Math.round(v * 1.609); return Math.round(v); }
    if (/living_street/i.test(s)) return 20; if (/urban/i.test(s)) return 50; if (/rural/i.test(s)) return 80; if (/motorway/i.test(s)) return 100;
  }
  return hw === "residential" ? 50 : null;
}
async function fetchLimit(lat, lon, v) {
  if (DEMO) return 50;
  const q = `[out:json][timeout:8];way(around:20,${lat.toFixed(6)},${lon.toFixed(6)})[highway~"^(${Object.keys(RANK).join("|")})$"];out tags;`;
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
      const r = await fetch(url + "?data=" + encodeURIComponent(q), { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) continue;
      const ways = ((await r.json()).elements || []).map(e => ({ rank: RANK[e.tags.highway] || 12, v: parseMax(e.tags.maxspeed, e.tags.highway) })).filter(w => w.v);
      if (!ways.length) return null;
      ways.sort((a, b) => v > 60 ? a.rank - b.rank : b.rank - a.rank);
      return ways[0].v;
    } catch {}
  }
  return undefined;
}
function lookupLimit(fix, v) {
  if (!S.auto || lim.busy || !navigator.onLine) return;
  const now = Date.now(), moved = lim.lastPos ? dist(lim.lastPos, fix) : Infinity;
  if (now - lim.lastAt < 12000 || moved < 60) return;
  lim.busy = true; lim.lastAt = now; lim.lastPos = fix;
  fetchLimit(fix.lat, fix.lon, v).then(x => { if (x) { lim.v = x; lim.at = Date.now(); } else if (x === null) lim.v = null; renderSpeed(); }).finally(() => lim.busy = false);
}
function curLimit() {
  if (S.auto && lim.v && Date.now() - lim.at < 90000) return { v: lim.v, src: "Auto", auto: true };
  return { v: S.manual, src: S.auto ? "Manual · no data" : "Manual", auto: false };
}
function renderSpeed() {
  const s = Math.round(speedKmh), L = curLimit(), over = s > L.v;
  $("#speed").textContent = s; $("#sbSpeed").textContent = s;
  $("#speed").classList.toggle("idle", !lastFixAt || s === 0);
  $("#limitVal").textContent = L.v; $("#sbLimit").textContent = L.v; $("#limitSrc").textContent = L.src;
  if (over && !wasOver && armed) { chime(); armed = false; }
  if (s <= L.v - 3) armed = true;
  wasOver = over;
  $("#speed").classList.toggle("over", over); $("#sbSpeed").classList.toggle("over", over);
  $("#limitBtn").classList.toggle("over", over); $("#sbLimit").parentElement.classList.toggle("over", over);
  renderStatus();
}

/* Duo status circle: ring = GPS strength, centre = internet, dots = speed-limit data */
function renderStatus() {
  const fresh = Date.now() - lastFixAt < 5000;
  const q = !fresh ? 0 : lastAcc <= 10 ? 1 : lastAcc <= 20 ? .75 : lastAcc <= 50 ? .45 : .2;
  const L = curLimit(), dots = L.auto ? 4 : S.auto ? 1 : 0;
  $$(".stat").forEach(svg => {
    svg.querySelector(".st-ring").style.strokeDasharray = `${(84.8 * q).toFixed(1)} 85`;
    svg.querySelector(".st-net").classList.toggle("off", !navigator.onLine);
    svg.querySelectorAll(".st-dots circle").forEach((c, i) => c.classList.toggle("off", i >= dots));
  });
  $("#diag").textContent = lastFixAt ? `GPS ${q >= .75 ? "strong" : q > 0 ? "weak" : "lost"} · ±${Math.round(lastAcc)} m · ${navigator.onLine ? "online" : "offline"}` : "Waiting for location…";
}
setInterval(renderStatus, 1000);
addEventListener("online", renderStatus); addEventListener("offline", renderStatus);

/* ======================= Weather (Open-Meteo, free) ======================= */
const WX = {
  0: ["Clear", "sun"], 1: ["Mostly clear", "sun"], 2: ["Partly cloudy", "part"], 3: ["Cloudy", "cloud"], 45: ["Fog", "fog"], 48: ["Fog", "fog"],
  51: ["Drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Drizzle", "rain"], 56: ["Freezing drizzle", "rain"], 57: ["Freezing drizzle", "rain"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"], 66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow", "snow"], 80: ["Showers", "rain"], 81: ["Showers", "rain"], 82: ["Heavy showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Snow showers", "snow"], 95: ["Thunderstorm", "storm"], 96: ["Thunderstorm", "storm"], 99: ["Thunderstorm", "storm"]
};
const CL = '<path d="M7 17h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.7 1A3 3 0 0 0 7 17z"/>';
const WI = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  part: '<path d="M9 7.5a3.5 3.5 0 0 1 6 1.2M9 4V3M4.8 5.8l-.7-.7M3.5 10h1"/><path d="M8 19h9a3 3 0 0 0 .3-6 4.3 4.3 0 0 0-8.4.9A2.6 2.6 0 0 0 8 19z"/>',
  cloud: CL, fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  rain: CL + '<path d="M9 20l.6-1.2M12.5 20l.6-1.2M16 20l.6-1.2"/>',
  snow: CL + '<path d="M9 20.5h.01M12.5 20.5h.01M16 20.5h.01"/>',
  storm: CL + '<path d="M12.5 17l-1.5 3h2l-1 2.5"/>'
};
const wsvg = (k, s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${WI[k] || CL}</svg>`;
let wxAt = store.get("wxAt", 0), wx = store.get("wx", null), wxBusy = false, place = store.get("wxPlace", "");
function renderWeather() {
  if (!wx) return;
  const c = wx.current, [label, ic0] = WX[c.weather_code] || ["—", "cloud"];
  const ic = ic0 === "sun" && !c.is_day ? "moon" : ic0;
  $("#wIcon").innerHTML = wsvg(ic, 38);
  $("#wTemp").textContent = Math.round(c.temperature_2m) + "°";
  $("#wCond").textContent = label;
  $("#wHL").textContent = `H:${Math.round(wx.daily.temperature_2m_max[0])}° L:${Math.round(wx.daily.temperature_2m_min[0])}°${place ? " · " + place : ""}`;
  $("#sbWeather").textContent = `${label} · ${Math.round(c.temperature_2m)}°`;
  const now = Date.now(), H = wx.hourly, out = [];
  for (let i = 0; i < H.time.length && out.length < 5; i++) {
    const t = new Date(H.time[i]).getTime(); if (t < now) continue;
    const k = (WX[H.weather_code[i]] || [0, "cloud"])[1];
    const hr = hr12(new Date(H.time[i]));
    out.push(`<div class="hr">${hr}${wsvg(k === "sun" && !H.is_day[i] ? "moon" : k, 18)}<b>${Math.round(H.temperature_2m[i])}°</b></div>`);
  }
  $("#wHours").innerHTML = out.join("");
}
async function weatherMaybe(force) {
  const lat = pos?.lat ?? S.lastLat, lon = pos?.lon ?? S.lastLon;
  if (lat == null || wxBusy || !navigator.onLine) return;
  if (!force && Date.now() - wxAt < 15 * 60000) return;
  wxBusy = true;
  try {
    if (DEMO) {
      const now = new Date(); now.setMinutes(0, 0, 0);
      wx = { current: { temperature_2m: 9, weather_code: 53, is_day: 1 }, daily: { temperature_2m_max: [10], temperature_2m_min: [7] },
        hourly: { time: [1,2,3,4,5].map(h => new Date(+now + h * 36e5).toISOString()), temperature_2m: [9,9,8,8,7], weather_code: [3,3,3,3,3], is_day: [1,1,0,0,0] } };
      place = "Vancouver";
    } else {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`;
      wx = await (await fetch(u)).json();
      try { const g = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)).json(); place = g.city || g.locality || ""; } catch {}
    }
    wxAt = Date.now(); store.set("wx", wx); store.set("wxAt", wxAt); store.set("wxPlace", place);
    renderWeather();
  } catch {} finally { wxBusy = false; }
}
renderWeather();
setInterval(() => weatherMaybe(), 5 * 60000);

/* ======================= Places + people ======================= */
function places() {
  return [
    { key: "home", name: "Home", icon: "i-home", addr: S.home },
    { key: "p2", name: S.p2Name || "Place", icon: "i-cap", addr: S.p2Addr },
    { key: "gas", name: "Gas", icon: "i-gas" }
  ];
}
function renderTiles() {
  $("#places").innerHTML = places().map(p => `<button class="tile" data-place="${p.key}"><div class="sq"><svg width="30" height="30"><use href="#${p.icon}"/></svg></div><div class="lbl">${esc(p.name)}</div></button>`).join("");
  $("#people").innerHTML = S.people.map((p, i) => p.name ? `<button class="tile" data-person="${i}"><div class="sq p">${esc(p.name[0].toUpperCase())}</div><div class="lbl">${esc(p.name)}</div></button>` : `<div class="tile"></div>`).join("");
  $("#phoneList").innerHTML = S.people.filter(p => p.name && p.num).map(p => `<a class="call-row" href="tel:${p.num.replace(/[^\d+]/g, "")}">${esc(p.name)}<svg width="22" height="22"><use href="#i-phone"/></svg></a>`).join("") || `<div class="call-row" style="color:var(--sec)">Add people in Settings</div>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const gmapsDir = (dest) => `comgooglemaps://?daddr=${encodeURIComponent(dest)}&directionsmode=driving`;
const gmapsWeb = (dest) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
function startNav(dest) { openURL(gmapsDir(dest)); setTimeout(() => { if (document.visibilityState === "visible") openURL(gmapsWeb(dest)); }, 1500); }

$("#places").addEventListener("click", e => {
  const b = e.target.closest("[data-place]"); if (!b) return;
  const p = places().find(x => x.key === b.dataset.place);
  if (p.key === "gas") { openURL("comgooglemaps://?q=gas+station"); return; }
  if (!p.addr) { toast(`Add the ${p.name} address in Settings`); openSheet("settings"); return; }
  if (document.body.classList.contains("narrow")) { startNav(p.addr); return; }
  setTab("map"); routeTo(p);
});
$("#people").addEventListener("click", e => {
  const b = e.target.closest("[data-person]"); if (!b) return;
  const p = S.people[+b.dataset.person];
  if (!p.num) { toast(`Add a number for ${p.name} in Settings`); openSheet("settings"); return; }
  const n = p.num.replace(/[^\d+]/g, "");
  $("#personName").textContent = p.name; $("#callLink").href = "tel:" + n; $("#textLink").href = "sms:" + n;
  openSheet("person");
});

/* ======================= Google Maps panel ======================= */
let map = null, meMarker = null, routeLine = null, routeDest = null, gLoading = false;
const MAP_LIGHT = [
  { elementType: "geometry", stylers: [{ color: "#f2f2f4" }] }, { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8e" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#f2f2f4" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e1e1e4" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dcdce0" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] }, { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] }
];
const MAP_DARK = [
  { elementType: "geometry", stylers: [{ color: "#1c1c1e" }] }, { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#f2f2f7" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }, { weight: 3 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2e" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a3c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] }, { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] }
];
function styleMap() { if (map) map.setOptions({ styles: curTheme === "dark" ? MAP_DARK : MAP_LIGHT }); if (routeLine) routeLine.setOptions({ strokeColor: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim() }); }
function mapEmpty(html) { const m = $("#mapEmpty"); m.hidden = !html; m.innerHTML = html || ""; }
function loadGoogle() {
  if (map || gLoading) return;
  if (DEMO) { $("#gmap").style.background = `url(${curTheme === "dark" ? "demo-map-dark.png" : "demo-map.png"}) center/cover`; mapEmpty(""); return; }
  if (!S.gKey) { mapEmpty(`<b>Add your Google Maps key</b>Paste it in Settings to see the map, live-traffic ETAs and routes.<button class="pill" data-open="settings">Open Settings</button>`); return; }
  if (!navigator.onLine) { mapEmpty(`<b>Map needs internet</b>Turn on your hotspot. Places still open Google Maps.`); return; }
  gLoading = true; mapEmpty(`Loading map…`);
  window.__gmInit = () => {
    gLoading = false; mapEmpty("");
    const c = pos ? { lat: pos.lat, lng: pos.lon } : { lat: S.lastLat ?? 49.25, lng: S.lastLon ?? -123.1 };
    map = new google.maps.Map($("#gmap"), { center: c, zoom: 13, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false, styles: curTheme === "dark" ? MAP_DARK : MAP_LIGHT });
    updateMe();
  };
  window.gm_authFailure = () => { gLoading = false; map = null; $("#gmap").innerHTML = ""; mapEmpty(`<b>Google Maps key didn't work</b>Check the key in Settings, and that Maps JavaScript API and Routes API are turned on.`); };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(S.gKey)}&v=weekly&callback=__gmInit&loading=async`;
  s.async = true; s.onerror = () => { gLoading = false; mapEmpty(`<b>Couldn't load Google Maps</b>Check your connection.`); };
  document.head.appendChild(s);
}
function updateMe() {
  if (!map || !pos) return;
  const ll = { lat: pos.lat, lng: pos.lon };
  if (!meMarker) meMarker = new google.maps.Marker({ map, position: ll, clickable: false, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#007aff", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } });
  else meMarker.setPosition(ll);
  if (!routeLine) map.panTo(ll);
}
function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0; const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
async function routeTo(p) {
  routeDest = p;
  $("#routeCard").hidden = false; $("#eta").textContent = "…"; $("#etaSub").textContent = `${p.name} · finding route`;
  if (!S.gKey || !navigator.onLine) { $("#eta").textContent = p.name; $("#etaSub").textContent = navigator.onLine ? "Add a Google key for ETAs" : "Offline · tap Go to navigate"; return; }
  const origin = pos ? { location: { latLng: { latitude: pos.lat, longitude: pos.lon } } } : S.lastLat != null ? { location: { latLng: { latitude: S.lastLat, longitude: S.lastLon } } } : null;
  if (!origin) { $("#eta").textContent = p.name; $("#etaSub").textContent = "Waiting for your location"; return; }
  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": S.gKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline" },
      body: JSON.stringify({ origin, destination: { address: p.addr }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" })
    });
    const j = await r.json(); const rt = j.routes && j.routes[0];
    if (!rt) throw new Error(j.error?.message || "No route");
    const sec = parseInt(rt.duration), mins = Math.round(sec / 60);
    const arrive = hm(new Date(Date.now() + sec * 1000));
    $("#eta").textContent = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    $("#etaSub").textContent = `${p.name} · ${(rt.distanceMeters / 1000).toFixed(rt.distanceMeters < 10000 ? 1 : 0)} km · arrive ${arrive}`;
    if (map) {
      const path = decodePolyline(rt.polyline.encodedPolyline);
      if (routeLine) routeLine.setMap(null);
      routeLine = new google.maps.Polyline({ map, path, strokeColor: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(), strokeWeight: 6, strokeOpacity: 1 });
      const b = new google.maps.LatLngBounds(); path.forEach(x => b.extend(x));
      map.fitBounds(b, { top: 70, left: 30, right: 30, bottom: 110 });
    }
  } catch (err) {
    $("#eta").textContent = p.name; $("#etaSub").textContent = "Couldn't get ETA · tap Go to navigate";
  }
}
$("#goBtn").addEventListener("click", () => { if (routeDest) startNav(routeDest.addr); });

/* ======================= Spotify ======================= */
const SP_SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private user-library-read";
let sp = store.get("sp", null); // {access, refresh, exp}
let np = null, npAt = 0, libLoaded = false;
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function spLogin() {
  if (!S.spId) { toast("Paste your Spotify Client ID first"); return; }
  const arr = crypto.getRandomValues(new Uint8Array(48)); const verifier = b64url(arr);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const st = btoa(JSON.stringify({ v: verifier, c: S.spId })).replace(/=+$/, "");
  location.href = `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: S.spId, response_type: "code", redirect_uri: REDIRECT, code_challenge_method: "S256", code_challenge: challenge, scope: SP_SCOPES, state: st })}`;
}
async function spToken(body) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = await r.json(); if (!j.access_token) throw new Error(j.error_description || "Spotify login failed");
  sp = { access: j.access_token, refresh: j.refresh_token || sp?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
  store.set("sp", sp); return sp;
}
async function spHandleRedirect() {
  const q = new URLSearchParams(location.search); if (!q.has("code") || !q.has("state")) return;
  let st; try { st = JSON.parse(atob(q.get("state"))); } catch { return; }
  history.replaceState(null, "", REDIRECT);
  try {
    if (!S.spId) save("spId", st.c);
    await spToken({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT, client_id: st.c, code_verifier: st.v });
    if (!isStandalone()) {
      // Logged in from Safari: hand the connection to the Home Screen app
      const code = btoa(JSON.stringify({ c: st.c, r: sp.refresh })).replace(/=+$/, "");
      try { await navigator.clipboard.writeText(code); } catch {}
      showCode(code);
    } else toast("Spotify connected");
  } catch (e) { toast(e.message, 5000); }
  spSync();
}
function showCode(code) {
  mapEmpty(""); openSheet("settings");
  $("#fSpCode").value = code;
  toast("Spotify connected here. If you use the Home Screen app, copy the code in Settings > Paste code into it.", 8000);
}
async function spUseCode(code) {
  try { const o = JSON.parse(atob(code.trim())); save("spId", o.c); sp = { refresh: o.r, exp: 0 }; await spToken({ grant_type: "refresh_token", refresh_token: o.r, client_id: o.c }); toast("Spotify connected"); $("#fSpCode").value = ""; spSync(); }
  catch { toast("That code didn't work. Connect again in Safari."); }
}
async function spApi(path, opt = {}) {
  if (!sp) throw new Error("nosp");
  if (Date.now() > sp.exp) await spToken({ grant_type: "refresh_token", refresh_token: sp.refresh, client_id: S.spId });
  let r = await fetch("https://api.spotify.com/v1" + path, { ...opt, headers: { Authorization: "Bearer " + sp.access, "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (r.status === 401) { await spToken({ grant_type: "refresh_token", refresh_token: sp.refresh, client_id: S.spId }); r = await fetch("https://api.spotify.com/v1" + path, { ...opt, headers: { Authorization: "Bearer " + sp.access, "Content-Type": "application/json" } }); }
  return r;
}
function renderNP() {
  const playing = np && np.item;
  const title = playing ? np.item.name : sp || DEMO ? "Nothing playing" : "Not playing";
  const artist = playing ? (np.item.artists || []).map(a => a.name).join(", ") || np.item.show?.name || "" : sp || DEMO ? "Pick something in Music" : "Connect Spotify in Settings";
  const progress = playing ? Math.min(np.item.duration_ms, (np.progress_ms || 0) + (np.is_playing ? Date.now() - npAt : 0)) : 0;
  const len = playing ? np.item.duration_ms : 0;
  $$(".song").forEach(e => e.textContent = title); $$(".artist").forEach(e => e.textContent = artist);
  $$(".prog").forEach(e => e.style.width = len ? (progress / len * 100).toFixed(2) + "%" : "0");
  $$(".t-pos").forEach(e => e.textContent = mmss(progress)); $$(".t-len").forEach(e => e.textContent = mmss(len));
  $$(".pp").forEach(u => u.setAttribute("href", np?.is_playing ? "#i-pause" : "#i-play"));
  const ctx = np?.context?.uri; $$(".pl").forEach(p => p.classList.toggle("playing", !!ctx && p.dataset.uri === ctx));
}
setInterval(renderNP, 1000);
async function spPoll() {
  if (DEMO) return;
  if (!sp || document.visibilityState !== "visible" || !navigator.onLine) return;
  try {
    const r = await spApi("/me/player?additional_types=episode");
    np = r.status === 204 ? null : await r.json(); npAt = Date.now(); renderNP();
  } catch {}
}
setInterval(spPoll, 4000);
async function spAct(kind) {
  if (DEMO) { if (kind === "toggle") { np.is_playing = !np.is_playing; np.progress_ms += Date.now() - npAt; npAt = Date.now(); } if (kind === "restart") { np.progress_ms = 0; npAt = Date.now(); } renderNP(); return; }
  if (!sp) { openURL("spotify:"); return; }
  try {
    let r;
    if (kind === "toggle") r = await spApi(np?.is_playing ? "/me/player/pause" : "/me/player/play", { method: "PUT" });
    if (kind === "next") r = await spApi("/me/player/next", { method: "POST" });
    if (kind === "restart") r = await spApi("/me/player/seek?position_ms=0", { method: "PUT" });
    if (r && r.status === 404) { toast("Open Spotify once so it can take commands"); openURL("spotify:"); return; }
    if (r && r.status === 403) { toast("Spotify Premium is needed for controls"); return; }
    if (kind === "toggle" && np) { np.progress_ms += np.is_playing ? Date.now() - npAt : 0; np.is_playing = !np.is_playing; npAt = Date.now(); renderNP(); }
    setTimeout(spPoll, 600);
  } catch { toast("Spotify didn't respond"); }
}
$$("[data-sp]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); spAct(b.dataset.sp); }));
async function loadLib() {
  if (DEMO) {
    const shades = ["#2c2c2e", "#636366", "#aeaeb2", "#48484a", "#8e8e93", "#d1d1d6", "#1c1c1e", "#7c7c80"];
    const L = [["Liked Songs", "212 songs"], ["Drive", "Playlist"], ["Iceman Mix", "Made for you"], ["For All The Dogs", "Drake"], ["Daily Mix 1", "Made for you"], ["Late Night", "Playlist"]];
    $("#lib").innerHTML = L.map((l, i) => `<button class="pl" data-uri="demo${i}"><div class="art" style="background-image:linear-gradient(135deg,${shades[i]},${shades[i + 2]})"></div><div class="n">${l[0]}</div><div class="a">${l[1]}</div></button>`).join("");
    libLoaded = true; return;
  }
  if (!sp) { $("#lib").innerHTML = ""; $("#libEmpty").hidden = false; $("#libEmpty").innerHTML = `<b>Connect Spotify</b>Your playlists show up here.<button class="pill" data-open="settings">Open Settings</button>`; return; }
  if (!navigator.onLine) { $("#libEmpty").hidden = false; $("#libEmpty").innerHTML = `<b>Music needs internet</b>Turn on your hotspot.`; return; }
  try {
    const me = await (await spApi("/me")).json();
    const pls = await (await spApi("/me/playlists?limit=20")).json();
    const items = [{ name: "Liked Songs", sub: "Your library", uri: `spotify:user:${me.id}:collection`, img: "" }]
      .concat((pls.items || []).filter(Boolean).map(p => ({ name: p.name, sub: p.owner?.display_name === me.display_name ? "Playlist" : (p.owner?.display_name || "Playlist"), uri: p.uri, img: p.images?.[0]?.url || "" })));
    $("#libEmpty").hidden = true;
    $("#lib").innerHTML = items.map(p => `<button class="pl" data-uri="${esc(p.uri)}"><div class="art" style="${p.img ? `background-image:url('${esc(p.img)}')` : "background-image:linear-gradient(135deg,#636366,#1c1c1e)"}"></div><div class="n">${esc(p.name)}</div><div class="a">${esc(p.sub)}</div></button>`).join("");
    libLoaded = true; renderNP();
  } catch { $("#libEmpty").hidden = false; $("#libEmpty").innerHTML = `<b>Couldn't load your music</b>Try reconnecting Spotify in Settings.`; }
}
$("#lib").addEventListener("click", async e => {
  const b = e.target.closest(".pl"); if (!b) return;
  if (DEMO) { toast("Playing " + b.querySelector(".n").textContent); return; }
  try {
    let r = await spApi("/me/player/play", { method: "PUT", body: JSON.stringify({ context_uri: b.dataset.uri }) });
    if (r.status === 404) {
      const d = await (await spApi("/me/player/devices")).json();
      const dev = (d.devices || []).find(x => /ipad/i.test(x.type + x.name)) || (d.devices || [])[0];
      if (dev) r = await spApi(`/me/player/play?device_id=${dev.id}`, { method: "PUT", body: JSON.stringify({ context_uri: b.dataset.uri }) });
      else { toast("Open Spotify once, then try again"); openURL("spotify:"); return; }
    }
    if (r.status === 403) { toast("Spotify Premium is needed to play from here"); return; }
    toast("Playing " + b.querySelector(".n").textContent); setTimeout(spPoll, 800);
  } catch { toast("Spotify didn't respond"); }
});
function spSync() {
  $("#spStatus").textContent = sp ? "Connected" : "Not connected";
  $("#spBtn").textContent = sp ? "Disconnect" : "Connect";
  if (curTab === "music") loadLib(); else libLoaded = false;
  spPoll(); renderNP();
}
$("#spBtn").addEventListener("click", () => { if (sp) { sp = null; store.del("sp"); np = null; spSync(); toast("Spotify disconnected"); } else spLogin(); });
$("#fSpCode").addEventListener("change", e => { if (e.target.value.trim()) spUseCode(e.target.value); });

/* ======================= Tabs + dock ======================= */
let curTab = store.get("tab", "map");
function setTab(t) {
  curTab = t; store.set("tab", t);
  $$(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  $("#mapView").hidden = t !== "map"; $("#musicView").hidden = t !== "music";
  $$(".ic").forEach(b => b.classList.toggle("on", b.dataset.dock === t));
  if (t === "map") loadGoogle();
  if (t === "music" && !libLoaded) loadLib();
}
$$(".tabs button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
$(".dock").addEventListener("click", e => {
  const b = e.target.closest(".ic"); if (!b) return; const k = b.dataset.dock, narrow = document.body.classList.contains("narrow");
  if (k === "map") narrow ? openURL("comgooglemaps://") : setTab("map");
  if (k === "music") narrow ? openURL("spotify:") : setTab("music");
  if (k === "phone") openSheet("phone");
  if (k === "messages") openURL("sms:");
});

/* ======================= Sheets ======================= */
let openId = null;
function openSheet(id) { closeSheet(); if (id === "settings") syncSettings(); openId = id; $("#scrim").classList.add("open"); $("#sheet-" + id).classList.add("open"); }
function closeSheet() { if (!openId) return; $("#sheet-" + openId).classList.remove("open"); $("#scrim").classList.remove("open"); openId = null; }
document.addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o) openSheet(o.dataset.open); if (e.target.closest("[data-close]")) closeSheet(); });
$("#scrim").addEventListener("click", closeSheet);
$("#limitBtn").addEventListener("click", () => openSheet("settings"));
$$(".sheet").forEach(sh => {
  let y0 = null, dy = 0, t0 = 0;
  sh.addEventListener("pointerdown", e => { if (sh.scrollTop > 0 || e.target.closest("button,input,label,a")) return; y0 = e.clientY; dy = 0; t0 = performance.now(); sh.style.transition = "none"; sh.setPointerCapture(e.pointerId); });
  sh.addEventListener("pointermove", e => { if (y0 == null) return; dy = e.clientY - y0; const s = dy > 0 ? dy : -(Math.abs(dy) * 22) / (40 + .55 * Math.abs(dy)); sh.style.transform = `translate(-50%, ${s}px)`; });
  const end = () => { if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0) * 1000; sh.style.transition = ""; sh.style.transform = ""; if (dy > 120 || v > 600) closeSheet(); y0 = null; };
  sh.addEventListener("pointerup", end); sh.addEventListener("pointercancel", end);
});

/* settings form */
const LIMITS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
$("#chips").innerHTML = LIMITS.map(v => `<button class="chip" data-v="${v}">${v}</button>`).join("");
$("#redirUri").textContent = REDIRECT;
function syncSettings() {
  $("#fHome").value = S.home; $("#fP2Name").value = S.p2Name; $("#fP2Addr").value = S.p2Addr;
  $("#fPeople").innerHTML = S.people.map((p, i) => `<div class="person-row"><input data-pi="${i}" data-pk="name" placeholder="Name" value="${esc(p.name)}"><input data-pi="${i}" data-pk="num" type="tel" placeholder="Phone number" value="${esc(p.num)}"></div>`).join("");
  $("#fAuto").checked = S.auto; $("#fChime").checked = S.chime; $("#fMono").checked = S.mono;
  $("#manualHint").textContent = S.auto ? "· used when no road data" : "";
  $$(".chip").forEach(c => c.classList.toggle("on", +c.dataset.v === S.manual));
  $("#fSpId").value = S.spId; $("#fGKey").value = S.gKey;
  $$("#sbSeg button").forEach(b => b.classList.toggle("on", +b.dataset.v === S.standby));
  applyTheme();
}
$("#fHome").addEventListener("change", e => save("home", e.target.value.trim()));
$("#fP2Name").addEventListener("change", e => { save("p2Name", e.target.value.trim() || "UBC"); renderTiles(); });
$("#fP2Addr").addEventListener("change", e => save("p2Addr", e.target.value.trim()));
$("#fPeople").addEventListener("change", e => { const i = e.target.dataset.pi; if (i == null) return; const ppl = S.people.map(p => ({ ...p })); ppl[i][e.target.dataset.pk] = e.target.value.trim(); save("people", ppl); renderTiles(); });
$("#fAuto").addEventListener("change", e => { save("auto", e.target.checked); lim.lastAt = 0; syncSettings(); renderSpeed(); });
$("#fChime").addEventListener("change", e => { save("chime", e.target.checked); if (e.target.checked) { unlockAudio(); chime(); } });
$("#fMono").addEventListener("change", e => { save("mono", e.target.checked); document.body.classList.toggle("mono", S.mono); });
$("#chips").addEventListener("click", e => { const c = e.target.closest(".chip"); if (!c) return; save("manual", +c.dataset.v); syncSettings(); renderSpeed(); });
$("#fSpId").addEventListener("change", e => save("spId", e.target.value.trim()));
$("#fGKey").addEventListener("change", e => { save("gKey", e.target.value.trim()); if (!map) { gLoading = false; loadGoogle(); } else toast("Reopen the app to use the new key"); });
$("#themeSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; save("theme", b.dataset.v); applyTheme(); });
$("#sbSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; save("standby", +b.dataset.v); syncSettings(); });

/* ======================= Standby ======================= */
let lastTouch = Date.now(), inStandby = false, wokeAt = 0;
function wake() { lastTouch = Date.now(); wokeAt = Date.now(); if (inStandby) { inStandby = false; $("#standby").hidden = true; } }
addEventListener("click", e => { if (Date.now() - wokeAt < 700) { e.stopPropagation(); e.preventDefault(); } }, true);
addEventListener("pointerdown", e => { if (inStandby && !e.target.closest(".music-mini .ctrls")) { e.preventDefault(); wake(); return; } lastTouch = Date.now(); }, true);
$("#standby").addEventListener("click", e => { if (!e.target.closest(".ctrls")) e.stopPropagation(); });
setInterval(() => {
  if (!started || inStandby || !S.standby || openId) return;
  if (Date.now() - lastTouch > S.standby * 1000) { inStandby = true; $("#standby").hidden = false; tick(); fitClock(); }
}, 1000);

/* ======================= Start ======================= */
function startLocation() {
  if (DEMO) return demoDrive();
  if (!("geolocation" in navigator)) { toast("Location isn't available here"); return; }
  navigator.geolocation.watchPosition(onPosition, onPosError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}
$("#startBtn").addEventListener("click", () => {
  started = true; unlockAudio(); keepAwake(); startLocation();
  $("#start").classList.add("gone"); lastTouch = Date.now();
  setTab(curTab); weatherMaybe(); spPoll();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && started) { keepAwake(); if (actx && actx.state === "suspended") actx.resume(); applyTheme(); spPoll(); weatherMaybe(); }
});

/* ======================= Demo drive (?demo) ======================= */
function demoDrive() {
  let lat = 49.2606, lon = -123.246, t = Date.now(), i = 0;
  const prof = [0, 8, 18, 27, 35, 42, 46, 48, 49, 50, 51, 53, 55, 57, 56, 54, 51, 49, 47, 46, 45, 40, 30, 18, 6, 0, 12, 25, 38, 47, 52, 56, 58, 57, 55, 52, 48, 46];
  setInterval(() => {
    const v = Math.max(0, prof[i++ % prof.length] + (Math.random() - .5)), m = v / 3.6; t += 1000;
    lat -= m * .3 / 111320; lon += m * .9 / (111320 * Math.cos(lat * Math.PI / 180));
    onPosition({ timestamp: t, coords: { latitude: lat, longitude: lon, accuracy: 5, speed: m } });
  }, 1000);
  np = { is_playing: true, progress_ms: 72000, item: { name: "Stuck", duration_ms: 204000, artists: [{ name: "Drake" }] } }; npAt = Date.now();
}

/* ======================= Boot ======================= */
document.body.classList.toggle("mono", S.mono);
applyTheme(); setInterval(applyTheme, 60000);
renderTiles(); renderSpeed(); renderNP(); syncSettings();
if (DEMO) { $("#routeCard").hidden = false; $("#eta").textContent = "44 min"; $("#etaSub").textContent = "Home · 36 km · arrive 4:45"; routeDest = places()[0]; }
spHandleRedirect().then(() => spSync());
if ("serviceWorker" in navigator && location.protocol === "https:" && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
