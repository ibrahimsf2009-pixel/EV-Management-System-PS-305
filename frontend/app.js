"use strict";

/* GridPulse frontend application — vanilla JS.
 *
 * Recreates the React app's behavior 1:1:
 *  - polls GET /api/state (backend computes the allocation)
 *  - renders every view: dashboard, vehicles, energy, analytics, settings
 *  - rolling 4s telemetry chart (canvas, same window as the original)
 *  - controls that POST to the API then re-render from the server response
 *  - plain-English EV explanations (click to expand) with mini flow strip
 */

// ── tiny SVG icon set (lucide paths, 1:1 with the React app) ────────────────
const I = {
  bolt: '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
  car: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  battery: '<path d="M7 7v10"/><path d="M11 7v10"/><path d="m15 7 3.5 5L15 17"/><rect x="3" y="5" width="14" height="14" rx="2"/>',
  check: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M18 17h4"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  minus: '<path d="M5 12h14"/>',
  cloud: '<path d="M17.5 22h.5a5 5 0 1 0-.9-9.92 5 5 0 1 0-9.2 3.92"/><path d="m2 20 4-4"/><path d="m6 20-4-4"/>',
};

function icon(name, size = 14) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${size}px;height:${size}px">${I[name] || ""}</svg>`;
}

// ── constants (1:1 with the original app) ───────────────────────────────────
const SCENARIOS = {
  normal: { gridCapacity: 50, buildingDemand: 17, solarGeneration: 17 },
  peak: { gridCapacity: 50, buildingDemand: 42, solarGeneration: 4 },
  solar: { gridCapacity: 50, buildingDemand: 19, solarGeneration: 34 },
};
const RANGES = {
  gridCapacity: { min: 30, max: 90 },
  buildingDemand: { min: 5, max: 60 },
  solarGeneration: { min: 0, max: 50 },
};
const STATUS_LABEL = {
  charging: "Charging",
  throttled: "Throttled",
  "constraint-limited": "Constraint limited",
  scheduled: "Scheduled",
  waiting: "Waiting",
  completed: "Completed",
};

// ── state ───────────────────────────────────────────────────────────────────
let S = null; // last server state
let view = "dashboard";
let scenario = "normal";
let chart = [
  { time: "08:00", building: 14, ev: 13, solar: 5, total: 22, limit: 50 },
  { time: "08:10", building: 16, ev: 17, solar: 7, total: 26, limit: 50 },
  { time: "08:20", building: 20, ev: 18, solar: 11, total: 27, limit: 50 },
  { time: "08:30", building: 22, ev: 20, solar: 14, total: 28, limit: 50 },
  { time: "08:40", building: 19, ev: 21, solar: 17, total: 23, limit: 50 },
];
const openRows = new Set();
const openExplains = new Set();

const $ = (sel) => document.querySelector(sel);

function fmtEta(a) {
  if (a.status === "completed") return "Done";
  if (a.etaMinutesFromNow == null) return a.power > 0 ? "—" : "Not charging";
  const m = a.etaMinutesFromNow;
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `~${h} h` : `~${h} h ${r} min`;
}

// ── API ─────────────────────────────────────────────────────────────────────
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function refresh() {
  try {
    S = await api("/api/state");
    applyScenarioName();
    render();
  } catch (err) {
    console.error("[GridPulse] state fetch failed:", err);
  }
}

function applyScenarioName() {
  if (!S) return;
  const preset = SCENARIOS[scenario];
  const st = S.state;
  scenario =
    preset &&
    preset.gridCapacity === st.gridCapacity &&
    preset.buildingDemand === st.buildingDemand &&
    preset.solarGeneration === st.solarGeneration
      ? Object.keys(SCENARIOS).find((k) => SCENARIOS[k] === preset) || "normal"
      : "custom";
  // Exact match detection
  scenario = "custom";
  for (const [name, p] of Object.entries(SCENARIOS)) {
    if (
      p.gridCapacity === st.gridCapacity &&
      p.buildingDemand === st.buildingDemand &&
      p.solarGeneration === st.solarGeneration
    ) {
      scenario = name;
      break;
    }
  }
}

async function postState(patch) {
  S = await api("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  applyScenarioName();
  render();
}

async function addVehicle(vehicle) {
  S = await api("/api/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vehicle),
  });
  applyScenarioName();
  render();
}

async function removeLastVehicle() {
  if (!S.vehicles.length) return;
  const last = S.vehicles[S.vehicles.length - 1];
  S = await api(`/api/vehicles/${encodeURIComponent(last.id)}`, { method: "DELETE" });
  applyScenarioName();
  render();
}

async function resetAll() {
  S = await api("/api/reset", { method: "POST" });
  scenario = "normal";
  openRows.clear();
  openExplains.clear();
  applyScenarioName();
  render();
}

// ── shared render pieces ────────────────────────────────────────────────────
function metricHTML(label, value, unit, iconName, accent) {
  return `
    <div class="panel panel-interactive metric${accent ? " accent" : ""}">
      <div class="top">
        <span class="label">${label}</span>
        <span class="icon-chip">${icon(iconName)}</span>
      </div>
      <div class="value-row">
        <span class="value">${value}</span>
        ${unit ? `<span class="unit">${unit}</span>` : ""}
      </div>
    </div>`;
}

function statusChip(a) {
  return `<span class="status-chip ${a.status}"><span class="dot"></span>${STATUS_LABEL[a.status]}</span>`;
}

function prioPill(p) {
  const cls = p >= 65 ? "high" : p >= 40 ? "mid" : "low";
  return `<span class="prio ${cls}">P${p}</span>`;
}

function vehicleRow(a, explain) {
  const open = openRows.has(a.id);
  const charging = a.power > 0;
  return `
  <div class="vehicle-row${open ? " open" : ""}" data-vehicle="${a.id}">
    <button type="button" class="vehicle-row-head" data-toggle="${a.id}" aria-expanded="${open}">
      <div>
        <div class="vehicle-id-row">
          <strong class="vehicle-id">${a.id}</strong>
          ${statusChip(a)}
          <span class="vehicle-departs">Departs ${a.departure}</span>
        </div>
        <div class="battery-line">
          <span class="battery-num">${a.battery}%</span>
          <div class="battery-bar">
            <span class="target-mark" style="left:${Math.min(100, a.target)}%"></span>
            <span class="fill" style="width:${Math.min(100, a.battery)}%"></span>
          </div>
          <span class="battery-target">→${a.target}%</span>
        </div>
        <div class="vehicle-meta">
          <span>${a.maxPower} kW max${charging && a.power < a.maxPower ? ` · ${a.power} kW now` : ""}</span>
          <span>·</span>
          <span>ETA ${fmtEta(a)}</span>
        </div>
      </div>
      <div class="vehicle-power-col">
        <strong class="vehicle-power tnum${charging ? " on" : ""}${charging ? " " + a.status : ""}">${a.power.toFixed(1)} kW</strong>
        <span class="priority-pill">${prioPill(a.priority)}<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.chevron}</svg></span>
      </div>
    </button>

    <div class="vehicle-detail">
      <div>
        <p class="detail-label">${icon("info", 10)} Why this priority</p>
        <p class="detail-text">${a.priorityReason}</p>
        <div class="factor-grid">
          ${factorBar("Battery", a.priorityFactors.batteryUrgency)}
          ${factorBar("Departure", a.priorityFactors.departureUrgency)}
          ${factorBar("Deficit", a.priorityFactors.energyDeficit)}
        </div>
      </div>
      <div style="margin-top:0.75rem">
        <p class="detail-label">${icon("zap", 10)} Why this allocation</p>
        <p class="detail-text">${a.powerReason}</p>
        ${a.notes.map((n) => `<p class="detail-notes">${icon("clock", 12)}${n}</p>`).join("")}
      </div>
      ${explainBlock(a, explain)}
      <div class="decision-context">
        <span>${icon("battery", 10)} Need ${a.energyNeededKwh} kWh</span>
        <span>${icon("gauge", 10)} Cluster budget ${a.capacityBudgetKw} kW</span>
        <span>${icon("car", 10)} Pack ${a.batteryPackKwh} kWh</span>
      </div>
    </div>
  </div>`;
}

function factorBar(label, value) {
  const pct = Math.round(value * 100);
  return `
    <div class="factor">
      <div class="factor-head"><span>${label}</span><span class="tnum">${pct}</span></div>
      <div class="factor-bar"><span class="factor-fill" style="width:${pct}%"></span></div>
    </div>`;
}

/* Plain-English explanation block (click to expand). */
function explainBlock(a, ex) {
  if (!ex) return "";
  const open = openExplains.has(a.id);
  const o = ex.outlook;
  const outlookIcon =
    o.state === "on-track" ? "check" : o.state === "at-risk" ? "alert" : "clock";
  const flowState = ex.flow.state;
  return `
  <div class="ev-explain${open ? " open" : ""}" data-explain="${a.id}">
    <div class="explain-head">
      <span>${ex.collapsed}</span>
      <svg class="explain-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${I.chevron}</svg>
    </div>
    <div class="explain-more">
      <div class="mini-flow">
        <span class="mf-node solar" title="Solar generation">${icon("sun", 11)} ${ex.flow.solarKw} kW</span>
        <svg class="mf-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <span class="mf-node grid" title="Building + grid">${icon("building", 11)} ${ex.flow.buildingKw} kW</span>
        <svg class="mf-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <span class="mf-node ctrl" title="Charging controller">${icon("zap", 11)} ${ex.flow.budgetKw} kW</span>
        <svg class="mf-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <span class="mf-node ev" title="This EV">${icon("car", 11)} ${a.id}</span>
        <span class="mf-state ${flowState}">${flowState}</span>
      </div>
      <div class="why-chips">
        ${ex.why.map((w) => {
          const tone =
            w.value === "High" ? "tone-high" : w.value === "Medium" ? "tone-mid" : w.value === "Low" ? "tone-good" : "";
          return `<span class="why-chip ${tone}">${w.label}: <strong>${w.value}</strong></span>`;
        }).join("")}
      </div>
      <p class="expanded-text">${ex.expanded}</p>
      <p class="action-text"><strong>What GridPulse is doing:</strong> ${ex.action}</p>
      <p class="outlook state-${o.state}">${icon(outlookIcon, 13)}<span>${o.text}</span></p>
    </div>
  </div>`;
}

function renderQueue(containerId, countId) {
  const el = $(containerId);
  if (!el || !S) return;
  const list = S.allocation.allocations;
  $(countId).textContent = `${list.length} connected`;
  el.innerHTML = list.length
    ? list.map((a) => vehicleRow(a, S.explanations[a.id])).join("")
    : `<div class="empty-note">No vehicles connected. Add an EV to start the simulation.</div>`;
}

function renderFlow(target, inputs, totalDemand, evLoad) {
  $(target).innerHTML = `
    <div class="flow-node tone-solar">${icon("sun", 20)}<span class="flow-label">Solar</span><strong class="flow-value">${inputs.solarGeneration} kW</strong></div>
    <div class="flow-connector"><span class="flow-line"></span><span class="flow-dot"></span><span class="flow-dot second"></span></div>
    <div class="flow-node">${icon("building", 20)}<span class="flow-label">Building</span><strong class="flow-value">${inputs.buildingDemand} kW</strong></div>
    <div class="flow-connector"><span class="flow-line"></span><span class="flow-dot"></span><span class="flow-dot second"></span></div>
    <div class="flow-node tone-energy">${icon("zap", 20)}<span class="flow-label">Controller</span><strong class="flow-value">${totalDemand.toFixed(1)} kW</strong></div>
    <div class="flow-connector"><span class="flow-line"></span><span class="flow-dot"></span><span class="flow-dot second"></span></div>
    <div class="flow-node tone-energy">${icon("car", 20)}<span class="flow-label">EV Cluster</span><strong class="flow-value">${evLoad.toFixed(1)} kW</strong></div>`;
}

function renderEnv(target, derived, inputs) {
  $(target).innerHTML = `
    <section class="panel env-grid">
      <div class="env-cell">
        <span class="env-icon">${icon("sun", 15)}</span>
        <div>
          <p class="env-label">Renewable supply</p>
          <strong class="env-value">${inputs.solarGeneration} kW</strong>
        </div>
      </div>
      <div class="env-cell">
        <div>
          <p class="env-label">Renewable share</p>
          <strong class="env-value tone-solar">${derived.renewableShare}%</strong>
        </div>
      </div>
      <div class="env-cell">
        <div>
          <p class="env-label">Solar surplus</p>
          <strong class="env-value">${derived.solarSurplus.toFixed(1)} kW</strong>
        </div>
      </div>
      <div class="env-cell">
        <div>
          <p class="env-label">Clean charging enabled</p>
          <strong class="env-value tone-primary">${icon("leaf", 14)}${derived.cleanCharging.toFixed(1)} kW</strong>
        </div>
      </div>
    </section>
    <footer class="site-footer">
      <span>GridPulse simulation environment</span>
      <span>No physical grid connection · telemetry generated locally</span>
    </footer>`;
}

function renderControls(targetId, compact) {
  const st = S.state;
  $(targetId).innerHTML = `
    ${compact ? `<div class="scenario-row" id="scenario-row-mini"></div>` : ""}
    ${slider("gridCapacity", "Grid capacity", st.gridCapacity, "kW")}
    ${slider("buildingDemand", "Building demand", st.buildingDemand, "kW")}
    ${slider("solarGeneration", "Solar generation", st.solarGeneration, "kW")}`;
  bindSliders($(targetId));
  if (compact) renderScenarioRow($("#scenario-row-mini"), true);
}

function slider(key, label, value, unit) {
  const r = RANGES[key];
  return `
    <div class="control">
      <div class="control-head">
        <span class="control-label">${label}</span>
        <span class="control-value">${value} ${unit}</span>
      </div>
      <input type="range" min="${r.min}" max="${r.max}" step="1" value="${value}" data-slider="${key}" aria-label="${label}" />
    </div>`;
}

function bindSliders(root) {
  root.querySelectorAll("input[data-slider]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.slider;
      const value = Number(input.value);
      const valueEl = input.parentElement.querySelector(".control-value");
      valueEl.textContent = `${value} kW`;
      postState({ [key]: value });
    });
  });
}

function renderScenarioRow(root, mini) {
  if (!root || !S) return;
  root.innerHTML = Object.keys(SCENARIOS)
    .map((name) => {
      const label = name === "solar" ? "Solar surplus" : name;
      return `<button type="button" class="btn ${scenario === name ? "btn-default" : "btn-outline"} scenario-btn" data-scenario="${name}">${label}</button>`;
    })
    .join("");
  root.querySelectorAll("button[data-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.scenario;
      scenario = name;
      postState(SCENARIOS[name]);
    });
  });
}

// ── canvas chart (AreaChart equivalent) ─────────────────────────────────────
function renderChart() {
  const canvas = $("#chart");
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 300;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const data = chart;
  if (data.length < 2) return;
  const pad = { l: 34, r: 10, t: 8, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const maxY = Math.max(...data.map((p) => Math.max(p.total, p.limit))) * 1.15 || 10;
  const x = (i) => pad.l + (i / (data.length - 1)) * iw;
  const y = (v) => pad.t + ih - (v / maxY) * ih;

  // horizontal grid lines + y labels
  ctx.font = "9px 'DM Mono', monospace";
  ctx.fillStyle = "oklch(0.8 0.02 235 / 0.6)";
  ctx.strokeStyle = "oklch(0.6 0.02 240 / 0.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const vy = pad.t + (ih / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, vy);
    ctx.lineTo(w - pad.r, vy);
    ctx.stroke();
    const label = Math.round(maxY - (maxY / 4) * i);
    ctx.fillText(String(label), 6, vy + 3);
  }
  // x labels
  ctx.fillStyle = "oklch(0.8 0.02 235 / 0.5)";
  const step = Math.ceil(data.length / 6);
  data.forEach((p, i) => {
    if (i % step === 0) ctx.fillText(p.time, x(i) - 12, h - 6);
  });

  // EV area fill (cyan gradient)
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
  grad.addColorStop(0, "oklch(0.84 0.13 180 / 0.25)");
  grad.addColorStop(1, "oklch(0.84 0.13 180 / 0)");
  ctx.beginPath();
  ctx.moveTo(x(0), y(data[0].ev));
  data.forEach((p, i) => ctx.lineTo(x(i), y(p.ev)));
  ctx.lineTo(x(data.length - 1), y(0));
  ctx.lineTo(x(0), y(0));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  const line = (key, color, width, dash) => {
    ctx.beginPath();
    data.forEach((p, i) => (i === 0 ? ctx.moveTo(x(i), y(p[key])) : ctx.lineTo(x(i), y(p[key]))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  line("ev", "oklch(0.84 0.13 180)", 2);
  line("building", "oklch(0.97 0.006 220 / 0.85)", 1.5);
  line("solar", "oklch(0.87 0.16 95)", 1.5);
  line("limit", "oklch(0.77 0.15 65)", 1.5, [5, 5]);

  // last EV point dot
  const last = data[data.length - 1];
  ctx.beginPath();
  ctx.arc(x(data.length - 1), y(last.ev), 3, 0, Math.PI * 2);
  ctx.fillStyle = "oklch(0.84 0.13 180)";
  ctx.fill();
}

// ── view renderers ──────────────────────────────────────────────────────────
function renderDashboard() {
  const st = S.state;
  const inputs = st;
  const a = S.allocation;
  const d = S.derived;
  const evLoad = a.totalAllocatedKw;

  $("#metrics").innerHTML =
    metricHTML("Active EVs", S.vehicles.length, "", "car") +
    metricHTML("Total demand", d.totalDemand.toFixed(1), "kW", "activity") +
    metricHTML("Charging budget", a.availableChargingCapacityKw.toFixed(1), "kW", "gauge", true) +
    metricHTML("Solar generation", inputs.solarGeneration, "kW", "sun") +
    metricHTML("EV charging", evLoad.toFixed(1), "kW", "battery", true) +
    metricHTML("Charging done", a.completedCount, "", "check");

  const isConstrained =
    d.utilization >= 90 || a.allocations.some((x) => x.power > 0 && x.power < x.maxPower);
  $("#constraint-alert").classList.toggle("hidden", !isConstrained);
  if (isConstrained) {
    $("#constraint-sub").textContent =
      a.availableChargingCapacityKw < 0.1
        ? "No charging capacity — building demand is consuming the full grid budget."
        : "EV charging automatically optimized · transformer limit protected";
    $("#constraint-util").textContent = `${d.utilization}% utilized`;
  }

  renderFlow("#flow-stage", inputs, d.totalDemand, evLoad);
  renderQueue("#vehicle-queue", "#queue-count");

  // Smart allocation: top 3
  $("#smart-allocation").innerHTML = a.allocations
    .slice(0, 3)
    .map((x, index) => {
      const top = index === 0;
      return `
      <div class="smart-card">
        <div class="head">
          <span class="vid">${x.id}</span>
          <span class="prio ${top ? "high" : "low"}">P${x.priority}</span>
        </div>
        <div style="margin-top:0.5rem">${statusChip(x)}</div>
        <p class="why-p">${x.priorityReason}</p>
        <p class="why-power">${x.powerReason}</p>
        <div class="foot">${icon("clock", 12)}<span>${x.departure}</span>→<span style="color:var(--foreground)">${x.power.toFixed(1)} / ${x.maxPower} kW</span></div>
      </div>`;
    })
    .join("");

  renderControls("#controls", false);
  renderScenarioRow($("#scenario-row"), false);
  renderEnv("#env-footer", d, inputs);
}

function renderVehicles() {
  const d = S.derived;
  const a = S.allocation;
  const totalKwh = a.allocations.reduce((s, x) => s + x.energyNeededKwh, 0);
  const chargingCount = a.allocations.filter((x) => x.power > 0).length;
  const avgBattery = S.vehicles.length
    ? Math.round(S.vehicles.reduce((s, v) => s + v.battery, 0) / S.vehicles.length)
    : 0;

  $("#vehicles-metrics").innerHTML =
    metricHTML("Fleet size", S.vehicles.length, "", "car") +
    metricHTML("Charging now", chargingCount, "", "battery", true) +
    metricHTML("Energy needed", totalKwh.toFixed(1), "kWh", "zap", true) +
    metricHTML("Fleet draw", a.totalAllocatedKw.toFixed(1), "kW", "activity") +
    metricHTML("Headroom", d.headroom.toFixed(1), "kW", "gauge") +
    metricHTML("Avg battery", avgBattery, "%", "trending");

  renderQueue("#vehicle-queue-2", "#queue-count-2");

  $("#sheet-count").textContent = `${S.vehicles.length} vehicles`;
  $("#fleet-sheet").innerHTML = a.allocations
    .map(
      (x) => `
    <tr>
      <td><span style="font-weight:700">${x.id}</span><span class="status-chip ${x.status}" style="margin-left:0.5rem"><span class="dot"></span></span></td>
      <td class="${x.battery < 30 ? "low-batt" : ""}">${x.battery}%</td>
      <td class="cell-muted">${x.target}%</td>
      <td class="cell-muted">${x.batteryPackKwh} kWh</td>
      <td class="cell-muted">${x.maxPower} kW</td>
      <td>${x.departure}</td>
      <td class="text-status ${x.status}">${x.power.toFixed(1)} kW</td>
      <td class="cell-muted">${fmtEta(x)}</td>
    </tr>`,
    )
    .join("") ||
    `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--muted-foreground)">No vehicles connected. Add one from the dashboard controls.</td></tr>`;
}

function renderEnergy() {
  const st = S.state;
  const d = S.derived;
  const evLoad = S.allocation.totalAllocatedKw;

  $("#ledger-load").textContent = `${d.utilization}% load`;
  const rows = [
    ["Grid capacity", `${st.gridCapacity} kW`, ""],
    ["Building demand", `${st.buildingDemand} kW`, ""],
    ["Solar generation", `${st.solarGeneration} kW`, "tone-solar"],
    ["EV cluster load", `${evLoad.toFixed(1)} kW`, "tone-primary"],
    ["Transformer import", `${Math.max(0, d.gridImport).toFixed(1)} kW`, ""],
    [
      "Export to grid",
      d.gridImport < 0 ? `${Math.abs(d.gridImport).toFixed(1)} kW` : "0.0 kW",
      d.gridImport < 0 ? "tone-solar" : "",
    ],
    ["Headroom", `${d.headroom.toFixed(1)} kW`, "tone-primary"],
    ["Utilization", `${d.utilization}%`, ""],
  ];
  $("#ledger").innerHTML = rows
    .map(
      ([label, value, tone]) => `
    <div class="ledger-row">
      <span class="ledger-label">${label}</span>
      <strong class="ledger-value ${tone}">${value}</strong>
    </div>`,
    )
    .join("");

  $("#demand-trace").innerHTML = chart
    .slice(-4)
    .reverse()
    .map(
      (p) => `
    <div class="trace-card">
      <p class="trace-time">${p.time}</p>
      <p class="trace-total">${p.total} <span class="trace-time">kW total</span></p>
      <p class="trace-solar">☀ ${p.solar} kW</p>
      <p class="trace-ev">⚡ ${p.ev} kW EV</p>
    </div>`,
    )
    .join("") || `<p class="empty-note" style="grid-column:1/-1">Waiting for telemetry…</p>`;

  renderEnv("#env-footer-2", d, st);
}

function renderAnalytics() {
  const a = S.allocation;
  const d = S.derived;
  const st = S.state;
  const charging = a.allocations.filter((x) => x.power > 0);
  const completed = a.allocations.filter((x) => x.status === "completed");
  const atRisk = a.allocations.filter((x) => (x.notes || []).length > 0);
  const avgPriority = a.allocations.length
    ? Math.round(a.allocations.reduce((s, x) => s + x.priority, 0) / a.allocations.length)
    : 0;
  const deliveryRate = charging.reduce((s, x) => s + x.power, 0);
  const peak = Math.max(...chart.map((p) => p.total), 0);
  const spread =
    charging.length > 1
      ? Math.round(
          (1 - Math.min(...charging.map((x) => x.power)) / Math.max(...charging.map((x) => x.power))) * 100,
        )
      : 0;

  $("#analytics-metrics").innerHTML =
    metricHTML("Vehicles served", `${charging.length}/${a.allocations.length}`, "", "battery", true) +
    metricHTML("Completed", completed.length, "", "shield") +
    metricHTML("At risk", atRisk.length, "", "clock") +
    metricHTML("Avg priority", avgPriority, "", "chart") +
    metricHTML("Delivery rate", deliveryRate.toFixed(1), "kWh/h", "zap", true) +
    metricHTML("Peak demand", peak.toFixed(1), "kW", "trending");

  $("#priority-dist").innerHTML =
    a.allocations
      .map(
        (x) => `
    <div class="dist-row">
      <span class="dist-id">${x.id}</span>
      <div class="dist-bar"><span class="dist-fill ${x.priority >= 65 ? "high" : x.priority >= 40 ? "mid" : ""}" style="width:${x.priority}%"></span></div>
      <span class="dist-val">${x.priority}</span>
    </div>`,
      )
      .join("") || `<p class="empty-note">No data yet.</p>`;

  const budget = st.gridCapacity - st.buildingDemand + st.solarGeneration;
  $("#efficiency").innerHTML = `
    ${indicator("Renewable share", `${d.renewableShare}%`, "solar vs total load", "tone-solar")}
    ${indicator("Clean charging", `${d.cleanCharging.toFixed(1)} kW`, "EV load covered by solar", "tone-primary")}
    ${indicator("Capacity utilization", `${d.utilization}%`, "transformer headroom used", "")}
    ${indicator("Power spread", spread ? `${spread}%` : "even", "gap between highest & lowest grant", "")}
    ${indicator("Solar surplus", `${d.solarSurplus.toFixed(1)} kW`, "exportable generation", "tone-solar")}
    ${indicator("Cluster budget", `${Math.max(0, budget)} kW`, "available to EVs now", "tone-primary")}`;
}

function indicator(label, value, note, tone) {
  return `
    <div class="indicator">
      <p class="ind-label">${label}</p>
      <strong class="ind-value ${tone}">${value}</strong>
      <p class="ind-note">${note}</p>
    </div>`;
}

function renderSettings() {
  const st = S.state;
  const a = S.allocation;
  renderScenarioRow($("#preset-cards"), false);
  // preset cards differ from buttons: richer content
  $("#preset-cards").innerHTML = Object.entries(SCENARIOS)
    .map(([name, p]) => {
      const label = name === "solar" ? "Solar surplus" : name;
      return `
      <button type="button" class="preset-card${scenario === name ? " active" : ""}" data-scenario="${name}">
        <span class="preset-name">${label}</span>
        <span class="preset-detail">${p.gridCapacity} kW cap · ${p.buildingDemand} kW bld · ${p.solarGeneration} kW sun</span>
      </button>`;
    })
    .join("");
  $("#preset-cards")
    .querySelectorAll("button[data-scenario]")
    .forEach((btn) =>
      btn.addEventListener("click", () => {
        scenario = btn.dataset.scenario;
        postState(SCENARIOS[scenario]);
      }),
    );

  renderControls("#controls-2", false);

  const budget = Math.max(0, st.gridCapacity - st.buildingDemand + st.solarGeneration);
  $("#allocator-ref").innerHTML = `
    <p><strong>Budget:</strong> the EV cluster may draw <span class="ref-num">${budget} kW</span> — grid capacity minus building load plus on-site solar. The transformer can never be overloaded, even during solar surplus.</p>
    <p><strong>Priority score:</strong> 40% battery urgency + 35% departure urgency + 25% energy deficit, recomputed against the real clock.</p>
    <p><strong>Two phases:</strong> the highest-priority vehicles are served at full rate first; remaining headroom is shared fairly (water-filling) among the rest.</p>
    <div class="ref-snapshot">
      <p class="snap-muted" style="text-transform:uppercase;letter-spacing:0.1em;font-size:9px;margin-bottom:0.375rem">Live queue snapshot</p>
      ${a.allocations
        .slice(0, 4)
        .map(
          (x) =>
            `<p><span style="color:var(--foreground)">${x.id}</span> <span class="snap-muted">P${x.priority} · ${x.power.toFixed(1)}/${x.maxPower} kW</span></p>`,
        )
        .join("") ||
        `<p class="snap-muted">No vehicles connected.</p>`}
    </div>
    <p class="ref-line">${icon("timer", 12)} All decisions recompute automatically every 30 seconds.</p>
    <p class="ref-line">${icon("leaf", 12)} State persists in MySQL and survives reloads.</p>`;
}

// ── render root ─────────────────────────────────────────────────────────────
function render() {
  if (!S) return;
  if (view === "dashboard") renderDashboard();
  else if (view === "vehicles") renderVehicles();
  else if (view === "energy") renderEnergy();
  else if (view === "analytics") renderAnalytics();
  else if (view === "settings") renderSettings();
  renderChart();
}

// ── navigation ──────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard: "Live Energy Operations",
  vehicles: "Vehicles",
  energy: "Energy",
  analytics: "Analytics",
  settings: "Settings",
};

function setView(next) {
  view = next;
  document.querySelectorAll(".view-section").forEach((el) => el.classList.remove("active"));
  $(`#view-${next}`).classList.add("active");
  document.querySelectorAll("#main-nav .btn").forEach((btn) => {
    const active = btn.dataset.nav === next;
    btn.classList.toggle("active", active);
    btn.classList.toggle("btn-secondary", active);
    btn.classList.toggle("btn-ghost", !active);
  });
  $("#page-title").textContent = VIEW_TITLES[next];
  render();
}

// ── events ──────────────────────────────────────────────────────────────────
document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    setView(nav.dataset.nav);
    return;
  }

  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.dataset.toggle;
    openRows.has(id) ? openRows.delete(id) : openRows.add(id);
    const row = toggle.closest(".vehicle-row");
    row.classList.toggle("open", openRows.has(id));
    row.querySelector(".vehicle-row-head").setAttribute("aria-expanded", openRows.has(id));
    return;
  }

  const explain = event.target.closest("[data-explain]");
  if (explain) {
    const id = explain.dataset.explain;
    openExplains.has(id) ? openExplains.delete(id) : openExplains.add(id);
    explain.classList.toggle("open", openExplains.has(id));
    return;
  }

  const addBtn = event.target.closest("#add-vehicle-btn");
  if (addBtn) {
    $("#vf-id").value = `EV-${String(S.vehicles.length + 8).padStart(2, "0")}`;
    $("#vehicle-dialog").classList.add("open");
    $("#vf-id").focus();
    return;
  }
  if (event.target.closest("#vf-cancel") || event.target === $("#vehicle-dialog")) {
    $("#vehicle-dialog").classList.remove("open");
    $("#vf-error").classList.remove("show");
    return;
  }
  if (event.target.closest("#vf-save")) {
    const vehicle = {
      id: $("#vf-id").value,
      battery: Number($("#vf-battery").value),
      target: Number($("#vf-target").value),
      departure: $("#vf-departure").value,
      maxPower: Number($("#vf-maxpower").value),
      batteryPackKwh: Number($("#vf-pack").value),
    };
    addVehicle(vehicle)
      .then(() => {
        $("#vehicle-dialog").classList.remove("open");
        $("#vf-error").classList.remove("show");
      })
      .catch((err) => {
        const el = $("#vf-error");
        el.textContent = err.message;
        el.classList.add("show");
      });
    return;
  }
  if (event.target.closest("#remove-vehicle-btn")) removeLastVehicle();
  if (event.target.closest("#reset-btn") || event.target.closest("#reset-btn-2")) resetAll();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#vehicle-dialog").classList.remove("open");
});

window.addEventListener("resize", renderChart);

// ── boot + polling ──────────────────────────────────────────────────────────
refresh();

// Poll the live allocation every 5s (server recomputes against the clock).
setInterval(refresh, 5000);

// Telemetry tick: append a point every 4s from the latest server state.
setInterval(() => {
  if (!S) return;
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  chart = [
    ...chart.slice(-8),
    {
      time: stamp,
      building: S.state.buildingDemand,
      ev: Number(S.allocation.totalAllocatedKw.toFixed(1)),
      solar: S.state.solarGeneration,
      total: Number(S.derived.totalDemand.toFixed(1)),
      limit: S.state.gridCapacity,
    },
  ];
  if (view === "dashboard" || view === "energy") renderChart();
  if (view === "energy") renderEnergy();
}, 4000);
