// claude-usage-gauge-card.js
// VERSION: 15
//   - Added a console version banner (prints the loaded build on start).
//   - Removed em dashes from header/inline comments.
//   - Packaged for HACS distribution (see repo README).
// VERSION: 14
//   - Editor fix: expandable sections (Weekly usage bar, Status labels &
//     thresholds, Display) no longer carry a `name`. A named expandable
//     makes ha-form read its child values from a nested object on reopen,
//     while our config stores everything flat, so saves worked but the
//     fields came back blank when re-editing. Title-only sections keep the
//     data flat in both directions. The defensive unwrap in the
//     value-changed handler stays as a guard.
// VERSION: 13
//   - Pace readout is now a plain-language message instead of "Pace NN%",
//     based on the gap (delta) between actual weekly usage and straight-line
//     expected usage: Well under pace / Under pace / On pace / Over pace /
//     Well over pace. Thresholds (pace_band_minor=3, pace_band_major=10
//     points) and all five labels are configurable. Hover the message for
//     the underlying numbers. Marker on the bar unchanged.
// VERSION: 12
//   - Pace parser now understands weekday + time reset formats like
//     "Wed 4:59 PM" (and bare times like "4:59 PM"), computing time
//     remaining until the next occurrence. Previously only durations
//     ("4d 12h") and full timestamps parsed, so pace stayed hidden.
//   - Timestamp fallback is sanity-checked to a plausible window.
// VERSION: 11
//   - Session reset line: when the reset attribute reads unknown/unavailable
//     (no active session yet), show configurable idle_text instead
//     (default "No active session").
//   - Weekly pacing: marker on the weekly bar + "Pace NN%" readout showing
//     straight-line expected usage across the weekly window, derived from
//     weekly_reset_entity (time remaining) and weekly_period_days (default
//     7). Actual over pace = warning color on the pace readout.
//   - No entity/attribute defaults anymore: reset_attribute, weekly_entity,
//     and weekly_reset_entity must be explicitly configured. Weekly section
//     stays hidden until weekly_entity is set.
// VERSION: 10
//   - Session % readout + label now render INSIDE the gauge arc (overlay),
//     status pill + session reset collapse to a single line below the arc.
//   - New weekly usage bar section below the gauge:
//       weekly_entity        (default sensor.claude_weekly_usage)
//       weekly_label         (default "Weekly Usage")
//       weekly_reset_entity  (default sensor.claude_weekly_resets), a
//         SEPARATE SENSOR, not an attribute; its state renders under the
//         bar in the primary ink color.
//     No status band/label on the weekly bar by design.
//   - All gauge visuals (gradient arc, ticks, needle, hub, theme tokens)
//     unchanged from v9.
// VERSION 9 note retained: do not reassign form.data on every editor
//   keystroke, see editor class comments.
//
// Install:
//   1. Copy this file to /config/www/claude-usage-gauge-card.js
//   2. Add resource in HA: Settings > Dashboards > Resources >
//        URL: /local/claude-usage-gauge-card.js?v=14
//        Type: JavaScript Module
//   3. Card config (YAML mode):
//        type: custom:claude-usage-gauge-card
//        entity: sensor.claude_session_usage
//        label: Claude Usage
//        reset_attribute: session_resets_in
//        weekly_entity: sensor.claude_weekly_usage
//        weekly_reset_entity: sensor.claude_weekly_resets

class ClaudeUsageGaugeCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("claude-usage-gauge-card-editor");
  }

  static getStubConfig() {
    return {
      entity: "sensor.claude_session_usage",
      label: "Claude Usage",
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an entity");
    }
    this._config = {
      label: "Claude Usage",
      decimals: 0,
      idle_text: "No active session",
      card_height: 380,
      band_elevated: 40,
      band_high: 75,
      band_critical: 92,
      label_nominal: "Nominal",
      label_elevated: "Elevated",
      label_high: "High Load",
      label_critical: "Critical",
      weekly_label: "Weekly Usage",
      weekly_decimals: 0,
      weekly_period_days: 7,
      weekly_pacing: true,
      pace_band_minor: 3,
      pace_band_major: 10,
      label_pace_under_major: "Well under pace",
      label_pace_under: "Under pace",
      label_pace_on: "On pace",
      label_pace_over: "Over pace",
      label_pace_over_major: "Well over pace",
      ...config,
    };
    if (!this._built) {
      this._build();
      this._built = true;
      this._syncTheme();
    }
    const card = this.querySelector("ha-card");
    if (card) {
      card.style.setProperty("--cug-max-height", `${this._config.card_height}px`);
    }
    this._label.textContent = this._config.label;
    this._wLabel.textContent = this._config.weekly_label;
    // Hide the weekly section entirely when no weekly entity configured
    // (set weekly_entity to empty string to disable).
    this._weekly.style.display = this._config.weekly_entity ? "" : "none";
  }

  set hass(hass) {
    this._hass = hass;
    this._syncTheme();
    const stateObj = hass.states[this._config.entity];

    if (!stateObj) {
      this._setUnavailable();
    } else {
      const raw = parseFloat(stateObj.state);
      if (Number.isNaN(raw)) {
        this._setUnavailable();
      } else {
        const pct = Math.max(0, Math.min(100, raw));
        this._setAvailable();
        this._animateTo(pct);
        this._applyBand(pct);

        const resetAttr = this._config.reset_attribute;
        const resetRaw =
          resetAttr && stateObj.attributes ? stateObj.attributes[resetAttr] : null;
        const noValue =
          resetRaw == null ||
          ["unknown", "unavailable", "none", ""].includes(
            String(resetRaw).trim().toLowerCase()
          );
        // Attribute configured but carries no real value (session hasn't
        // started yet) -> show idle_text instead of a raw "unknown".
        this._reset.textContent = noValue
          ? this._config.idle_text ?? "No active session"
          : `${resetRaw}`;
        this._reset.style.display = resetAttr ? "" : "none";

        this._root.setAttribute(
          "aria-label",
          `${this._config.label}, ${pct.toFixed(this._config.decimals)} percent`
        );
      }
    }

    this._updateWeekly(hass);
  }

  getCardSize() {
    return 5;
  }

  // ---- weekly bar ------------------------------------------------------

  _updateWeekly(hass) {
    if (!this._config.weekly_entity) return;

    const st = hass.states[this._config.weekly_entity];
    const raw = st ? parseFloat(st.state) : NaN;
    let pct = null;

    if (Number.isNaN(raw)) {
      this._wNum.textContent = "\u2014"; // em dash placeholder
      this._wFill.style.width = "0%";
      this._weekly.setAttribute("aria-valuenow", "0");
    } else {
      pct = Math.max(0, Math.min(100, raw));
      const v = pct.toFixed(this._config.weekly_decimals);
      this._wNum.textContent = v;
      this._wFill.style.width = `${pct}%`;
      this._weekly.setAttribute("aria-valuenow", v);
      this._weekly.setAttribute(
        "aria-label",
        `${this._config.weekly_label}, ${v} percent`
      );
    }

    // Weekly reset is its own sensor, not an attribute.
    const rEnt = this._config.weekly_reset_entity;
    const rObj = rEnt ? hass.states[rEnt] : null;
    const rVal =
      rObj && rObj.state && !["unknown", "unavailable"].includes(rObj.state)
        ? rObj.state
        : null;
    this._wReset.textContent = rVal ? `${rVal}` : "";
    this._wReset.style.display = rVal ? "" : "none";

    this._updatePace(pct, rVal);
  }

  // Straight-line pacing: expected % = elapsed fraction of the weekly
  // window. Time remaining comes from the weekly reset sensor; the window
  // length is weekly_period_days (default 7).
  _updatePace(pct, resetState) {
    const enabled = this._config.weekly_pacing !== false;
    const remainMs = enabled ? this._parseDurationMs(resetState) : null;
    const periodMs =
      (this._config.weekly_period_days ?? 7) * 24 * 60 * 60 * 1000;

    if (remainMs == null || periodMs <= 0) {
      this._wPaceMark.style.display = "none";
      this._wPaceText.style.display = "none";
      return;
    }

    const expected = Math.max(
      0,
      Math.min(100, ((periodMs - remainMs) / periodMs) * 100)
    );

    this._wPaceMark.style.left = `${expected.toFixed(1)}%`;
    this._wPaceMark.style.display = "";

    // Plain-language message driven by the gap between actual usage and
    // straight-line expected usage (in percentage points).
    if (pct == null) {
      this._wPaceText.style.display = "none";
      return;
    }
    const c = this._config;
    const minor = c.pace_band_minor ?? 3;
    const major = c.pace_band_major ?? 10;
    const delta = pct - expected;

    let text, colorVar;
    if (delta < -major) {
      text = c.label_pace_under_major ?? "Well under pace";
      colorVar = "--cug-success";
    } else if (delta < -minor) {
      text = c.label_pace_under ?? "Under pace";
      colorVar = "--cug-success";
    } else if (delta <= minor) {
      text = c.label_pace_on ?? "On pace";
      colorVar = "--cug-dim";
    } else if (delta <= major) {
      text = c.label_pace_over ?? "Over pace";
      colorVar = "--cug-warn";
    } else {
      text = c.label_pace_over_major ?? "Well over pace";
      colorVar = "--cug-danger";
    }

    this._wPaceText.style.display = "";
    this._wPaceText.textContent = text;
    this._wPaceText.style.color = `var(${colorVar})`;
    this._wPaceText.title = `Actual ${pct.toFixed(0)}% vs expected ${expected.toFixed(0)}% (${delta >= 0 ? "+" : ""}${delta.toFixed(0)} pts)`;
  }

  // Accepts a weekday + time ("Wed 4:59 PM"), a bare time ("4:59 PM"),
  // a duration string ("4d 12h", "12h 5m", "38m"), or a full timestamp.
  // Returns remaining ms until reset, or null if unparseable.
  _parseDurationMs(str) {
    if (!str) return null;
    const s = String(str).trim();

    // "Wed 4:59 PM" style -> next occurrence of that weekday at that time
    const wt = this._parseWeekdayTimeMs(s);
    if (wt != null) return wt;

    // Duration tokens
    let ms = 0;
    let matched = false;
    const take = (re, mult) => {
      const m = s.match(re);
      if (m) {
        ms += parseFloat(m[1]) * mult;
        matched = true;
      }
    };
    take(/(\d+(?:\.\d+)?)\s*d\b/i, 86400000);
    take(/(\d+(?:\.\d+)?)\s*h\b/i, 3600000);
    take(/(\d+(?:\.\d+)?)\s*m(?!s)\b/i, 60000);
    take(/(\d+(?:\.\d+)?)\s*s\b/i, 1000);
    if (matched) return ms;

    // Full timestamp fallback, sanity-checked to a plausible window so a
    // garbage parse (e.g. year 2001) can't produce a bogus pace.
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const diff = t - Date.now();
      if (diff > -6 * 3600000 && diff < 45 * 86400000) return Math.max(0, diff);
    }
    return null;
  }

  // "Wed 4:59 PM", "Wednesday 16:59", or "4:59 PM" -> ms until the next
  // occurrence of that moment. Returns null if the string doesn't match.
  _parseWeekdayTimeMs(s) {
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    let dayIdx = null;
    let hh, mm, ap;

    let m = s.match(/^([a-z]+)\.?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (m) {
      dayIdx = days.indexOf(m[1].slice(0, 3).toLowerCase());
      if (dayIdx === -1) return null;
      hh = parseInt(m[2], 10);
      mm = parseInt(m[3], 10);
      ap = m[4];
    } else {
      m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
      if (!m) return null;
      hh = parseInt(m[1], 10);
      mm = parseInt(m[2], 10);
      ap = m[3];
    }

    if (hh > 23 || mm > 59) return null;
    if (ap) {
      const p = ap.toLowerCase();
      if (p === "pm" && hh < 12) hh += 12;
      if (p === "am" && hh === 12) hh = 0;
    }

    const now = new Date();
    const target = new Date(now);
    target.setHours(hh, mm, 0, 0);
    if (dayIdx != null) {
      const delta = (dayIdx - now.getDay() + 7) % 7;
      target.setDate(now.getDate() + delta);
      if (target <= now) target.setDate(target.getDate() + 7);
    } else if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
  }

  // ---- theme resolution (unchanged from v9) ----------------------------

  _syncTheme() {
    const card = this.querySelector("ha-card");
    if (!card) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);
    const read = (name, fallback) => {
      let v = rootStyles.getPropertyValue(name).trim();
      if (!v) v = bodyStyles.getPropertyValue(name).trim();
      return v || fallback;
    };

    const tokens = {
      "--cug-bg": read("--card-background-color", read("--ha-card-background", "#1c1f26")),
      "--cug-accent": read("--primary-color", "#7c5cff"),
      "--cug-accent-2": read("--accent-color", read("--state-icon-active-color", "#9b8cff")),
      "--cug-track": read("--divider-color", "#2b2f3a"),
      "--cug-ink": read("--primary-text-color", "#e9ecf6"),
      "--cug-dim": read("--secondary-text-color", "#8a8f9c"),
      "--cug-warn": read("--warning-color", "#f5a623"),
      "--cug-danger": read("--error-color", "#ff5c5c"),
      "--cug-success": read("--success-color", "#43a047"),
    };
    for (const [name, value] of Object.entries(tokens)) {
      card.style.setProperty(name, value);
    }
    this._tokens = tokens;

    const accentRgb = this._parseRgb(this._resolveToRgb(tokens["--cug-accent"], card));
    if (accentRgb) card.style.setProperty("--cug-accent-rgb", accentRgb.join(","));
  }

  _resolveToRgb(colorStr, hostEl) {
    if (!colorStr) return null;
    const probe = document.createElement("span");
    probe.style.display = "none";
    probe.style.color = colorStr;
    (hostEl || document.body).appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }

  _parseRgb(colorStr) {
    if (!colorStr) return null;
    const m = colorStr.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
      if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
    }
    return null;
  }

  // ---- build -----------------------------------------------------------

  _build() {
    this._reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._cur = 0;
    this._raf = 0;

    const wrapper = document.createElement("ha-card");
    wrapper.innerHTML = `
      <style>
        :host {
          --cug-bg: #1c1f26;
          --cug-accent: #7c5cff;
          --cug-accent-2: #9b8cff;
          --cug-track: #2b2f3a;
          --cug-ink: #e9ecf6;
          --cug-dim: #8a8f9c;
          --cug-warn: #f5a623;
          --cug-danger: #ff5c5c;
          --cug-success: #43a047;
        }
        ha-card {
          background: var(--cug-bg);
          color: var(--cug-ink);
          font-family: var(--paper-font-common-base_-_font-family, ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace);
          padding: 0;
          overflow: hidden;
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, none);
          border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, transparent));
        }
        .cug-stage {
          position: relative;
          width: 100%;
          padding: 14px 16px 4px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .cug-svg-box {
          position: relative;
          width: min(100%, 520px);
          max-height: var(--cug-max-height, 380px);
          container-type: inline-size;
        }
        .cug-svg { width: 100%; height: auto; overflow: visible; display: block; }
        .cug-needle {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          will-change: transform;
          transition: none;
        }
        .cug-tick { stroke: var(--cug-track); }
        .cug-tick.maj { stroke: var(--cug-dim); opacity: .9; }

        /* Readout overlaid INSIDE the arc */
        .cug-center {
          position: absolute;
          left: 0; right: 0;
          top: 28%;
          text-align: center;
          font-variant-numeric: tabular-nums;
          letter-spacing: .02em;
          pointer-events: none;
        }
        .cug-val {
          font-size: clamp(24px, 15cqw, 56px);
          font-weight: 700; line-height: 1;
          color: var(--cug-ink);
        }
        .cug-val .pct {
          font-size: .42em; font-weight: 600;
          color: var(--cug-accent-2);
          margin-left: .12em; vertical-align: .55em;
        }
        .cug-label {
          margin-top: .45em;
          font-size: clamp(7px, 2.3cqw, 11px);
          font-weight: 600; letter-spacing: .28em; text-transform: uppercase;
          color: var(--cug-dim);
        }

        /* Status pill + session reset on one line under the arc */
        .cug-substatus {
          margin-top: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: .8em;
        }
        .cug-status {
          display: inline-block;
          font-size: clamp(9px, 2.4cqw, 13px);
          font-weight: 700; letter-spacing: .1em;
          padding: .3em .8em; border-radius: 4px;
          border: 1px solid var(--cug-track);
          color: var(--cug-accent-2);
        }
        .cug-reset {
          font-size: clamp(11px, 3cqw, 16px);
          font-weight: 700;
          color: var(--cug-dim);
        }
        .cug-unavailable-msg {
          margin-top: .5em;
          text-align: center;
          font-size: clamp(8px, 2.2cqw, 12px);
          color: var(--cug-dim);
          white-space: nowrap;
        }

        /* Weekly usage bar */
        .cug-weekly {
          margin: 14px 18px 16px;
          padding-top: 13px;
          border-top: 1px solid var(--cug-track);
          font-variant-numeric: tabular-nums;
        }
        .cug-w-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 7px;
        }
        .cug-w-label {
          font-size: clamp(7px, 2cqw, 10px);
          font-weight: 700; letter-spacing: .24em; text-transform: uppercase;
          color: var(--cug-dim);
        }
        .cug-w-val {
          font-size: clamp(12px, 3.2cqw, 16px);
          font-weight: 700;
          color: var(--cug-ink);
        }
        .cug-w-val .pct {
          font-size: .68em; font-weight: 600;
          color: var(--cug-accent-2);
          margin-left: .1em;
        }
        .cug-w-track {
          position: relative;
          height: 10px;
          border-radius: 5px;
          background: var(--cug-track);
          overflow: hidden;
        }
        .cug-w-pace {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          transform: translateX(-1px);
          background: var(--cug-ink);
          opacity: .6;
        }
        .cug-w-fill {
          height: 100%;
          width: 0%;
          border-radius: 5px;
          background: linear-gradient(90deg, var(--cug-accent), var(--cug-accent-2));
          transition: width .6s cubic-bezier(.22,.61,.36,1);
        }
        @media (prefers-reduced-motion: reduce) {
          .cug-w-fill { transition: none; }
        }
        .cug-w-foot {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-top: 6px;
        }
        .cug-w-pacetext {
          font-size: clamp(9px, 2.5cqw, 13px);
          font-weight: 700;
          color: var(--cug-dim);
        }
        /* Weekly reset uses the primary ink color (darker per design) */
        .cug-w-reset {
          font-size: clamp(9px, 2.5cqw, 13px);
          font-weight: 700;
          color: var(--cug-ink);
        }
      </style>
      <div class="cug-stage">
        <div class="cug-svg-box"
             role="progressbar"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <svg class="cug-svg" viewBox="38 88 324 187" aria-hidden="true">
            <defs>
              <linearGradient id="cug-arc-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="var(--cug-accent)"/>
                <stop offset="100%" stop-color="var(--cug-accent-2)"/>
              </linearGradient>
            </defs>
            <path d="M50 250 A150 150 0 0 1 350 250" fill="none"
                  stroke="var(--cug-track)" stroke-width="14" stroke-linecap="round"/>
            <path class="cug-prog" d="M50 250 A150 150 0 0 1 350 250" fill="none"
                  stroke="url(#cug-arc-grad)" stroke-width="14" stroke-linecap="round"
                  pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000"/>
            <g class="cug-ticks"></g>
            <circle cx="200" cy="250" r="20" fill="var(--cug-bg)" stroke="var(--cug-track)" stroke-width="2"/>
            <circle cx="200" cy="250" r="8" fill="var(--cug-accent)"/>
            <g class="cug-needle">
              <path d="M200 250 L196 140 L200 130 L204 140 Z" fill="var(--cug-accent-2)"/>
            </g>
          </svg>
          <div class="cug-center">
            <div class="cug-val"><span class="cug-num">0</span><span class="pct">%</span></div>
            <div class="cug-label"></div>
          </div>
        </div>
        <div class="cug-substatus">
          <span class="cug-status"></span>
          <span class="cug-reset"></span>
        </div>
        <div class="cug-unavailable-msg" style="display:none;">Sensor unavailable</div>
      </div>
      <div class="cug-weekly"
           role="progressbar"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="cug-w-head">
          <span class="cug-w-label"></span>
          <span class="cug-w-val"><span class="cug-w-num">0</span><span class="pct">%</span></span>
        </div>
        <div class="cug-w-track">
          <div class="cug-w-fill"></div>
          <div class="cug-w-pace" style="display:none;"></div>
        </div>
        <div class="cug-w-foot">
          <span class="cug-w-pacetext" style="display:none;"></span>
          <span class="cug-w-reset"></span>
        </div>
      </div>
    `;

    this.innerHTML = "";
    this.appendChild(wrapper);

    this._root = wrapper.querySelector(".cug-svg-box");
    this._needle = wrapper.querySelector(".cug-needle");
    this._prog = wrapper.querySelector(".cug-prog");
    this._num = wrapper.querySelector(".cug-num");
    this._label = wrapper.querySelector(".cug-label");
    this._status = wrapper.querySelector(".cug-status");
    this._reset = wrapper.querySelector(".cug-reset");
    this._unavailMsg = wrapper.querySelector(".cug-unavailable-msg");
    this._weekly = wrapper.querySelector(".cug-weekly");
    this._wLabel = wrapper.querySelector(".cug-w-label");
    this._wNum = wrapper.querySelector(".cug-w-num");
    this._wFill = wrapper.querySelector(".cug-w-fill");
    this._wReset = wrapper.querySelector(".cug-w-reset");
    this._wPaceMark = wrapper.querySelector(".cug-w-pace");
    this._wPaceText = wrapper.querySelector(".cug-w-pacetext");

    this._buildTicks(wrapper.querySelector(".cug-ticks"));

    this.START = -90; // degrees
    this.SWEEP = 180;
    this.ARCLEN = 1000;
  }

  _buildTicks(group) {
    const ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i <= 20; i++) {
      const maj = i % 5 === 0;
      const a = -90 + 180 * (i / 20);
      const rad = ((a - 90) * Math.PI) / 180;
      const len = maj ? 16 : 9;
      const x1 = 200 + Math.cos(rad) * 132;
      const y1 = 250 + Math.sin(rad) * 132;
      const x2 = 200 + Math.cos(rad) * (132 - len);
      const y2 = 250 + Math.sin(rad) * (132 - len);
      const ln = document.createElementNS(ns, "line");
      ln.setAttribute("x1", x1.toFixed(1));
      ln.setAttribute("y1", y1.toFixed(1));
      ln.setAttribute("x2", x2.toFixed(1));
      ln.setAttribute("y2", y2.toFixed(1));
      ln.setAttribute("stroke-width", maj ? "2.5" : "1.5");
      ln.setAttribute("class", "cug-tick" + (maj ? " maj" : ""));
      group.appendChild(ln);
    }
  }

  _setUnavailable() {
    this._unavailMsg.style.display = "block";
    this._status.textContent = "Unavailable";
  }

  _setAvailable() {
    this._unavailMsg.style.display = "none";
  }

  _applyBand(pct) {
    const {
      band_elevated,
      band_high,
      band_critical,
      label_nominal,
      label_elevated,
      label_high,
      label_critical,
    } = this._config;
    let text, colorVar;
    if (pct >= band_critical) {
      text = label_critical ?? "Critical";
      colorVar = "--cug-danger";
    } else if (pct >= band_high) {
      text = label_high ?? "High Load";
      colorVar = "--cug-warn";
    } else if (pct >= band_elevated) {
      text = label_elevated ?? "Elevated";
      colorVar = "--cug-warn";
    } else {
      text = label_nominal ?? "Nominal";
      colorVar = "--cug-success";
    }
    this._status.textContent = text;
    this._status.style.color = `var(${colorVar})`;
    this._status.style.borderColor = `var(${colorVar})`;
  }

  _paint(pct) {
    const p = pct / 100;
    const ang = this.START + this.SWEEP * p;
    this._needle.style.transform = `rotate(${ang.toFixed(2)}deg)`;
    this._prog.style.strokeDashoffset = (this.ARCLEN * (1 - p)).toFixed(1);
    const v = pct.toFixed(this._config.decimals);
    this._num.textContent = v;
    this._root.setAttribute("aria-valuenow", v);
  }

  _animateTo(target) {
    if (this._reduceMotion) {
      this._cur = target;
      this._paint(target);
      return;
    }
    if (this._raf) cancelAnimationFrame(this._raf);
    const from = this._cur;
    const to = target;
    const dur = 700;
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      this._cur = from + (to - from) * e;
      this._paint(this._cur);
      if (k < 1) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._cur = to;
        this._raf = 0;
      }
    };
    this._raf = requestAnimationFrame(tick);
  }
}

customElements.define("claude-usage-gauge-card", ClaudeUsageGaugeCard);

class ClaudeUsageGaugeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    if (!this._form) {
      this._buildForm();
      this._lastEntity = config.entity || "";
      return;
    }
    // IMPORTANT: do not reassign this._form.data here on every call. This
    // setConfig is invoked as a direct result of our own value-changed
    // handler firing config-changed, ha-form already holds the live,
    // in-progress value internally at that point. Handing it a brand-new
    // data object in response fights the user's typing (the form
    // treats it as an external update and can reset mid-edit fields,
    // especially number inputs and anything inside an expandable section,
    // which is exactly the "one keystroke then blank" symptom).
    // Only the entity-driven schema swap below needs to happen here.
    const newEntity = this._config.entity || "";
    if (newEntity !== this._lastEntity) {
      this._lastEntity = newEntity;
      this._form.schema = this._schema();
      // Schema changed out from under the form (different attribute
      // selector options), this is the one case we DO need to resync data,
      // since the form was just handed a structurally different schema.
      this._form.data = this._dataFromConfig();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _dataFromConfig() {
    const c = this._config || {};
    return {
      entity: c.entity || "",
      label: c.label ?? "Claude Usage",
      reset_attribute: c.reset_attribute ?? "",
      idle_text: c.idle_text ?? "No active session",
      weekly_entity: c.weekly_entity ?? "",
      weekly_label: c.weekly_label ?? "Weekly Usage",
      weekly_reset_entity: c.weekly_reset_entity ?? "",
      weekly_period_days: c.weekly_period_days ?? 7,
      pace_band_minor: c.pace_band_minor ?? 3,
      pace_band_major: c.pace_band_major ?? 10,
      label_pace_under_major: c.label_pace_under_major ?? "Well under pace",
      label_pace_under: c.label_pace_under ?? "Under pace",
      label_pace_on: c.label_pace_on ?? "On pace",
      label_pace_over: c.label_pace_over ?? "Over pace",
      label_pace_over_major: c.label_pace_over_major ?? "Well over pace",
      label_nominal: c.label_nominal ?? "Nominal",
      label_elevated: c.label_elevated ?? "Elevated",
      label_high: c.label_high ?? "High Load",
      label_critical: c.label_critical ?? "Critical",
      band_elevated: c.band_elevated ?? 40,
      band_high: c.band_high ?? 75,
      band_critical: c.band_critical ?? 92,
      decimals: c.decimals ?? 0,
      card_height: c.card_height ?? 380,
    };
  }

  _buildForm() {
    this.innerHTML = "";
    const form = document.createElement("ha-form");
    form.schema = this._schema();
    form.data = this._dataFromConfig();
    form.computeLabel = (schemaItem) => this._labelFor(schemaItem);
    if (this._hass) form.hass = this._hass;

    form.addEventListener("value-changed", (e) => {
      const incoming = e.detail.value || {};
      // ha-form is expected to emit a flat object (expandable/grid groups
      // are just visual wrappers), but defensively unwrap any keys that
      // come back as nested objects matching our known group names, so a
      // version difference in ha-form's behavior can't silently drop data.
      const flat = { ...incoming };
      for (const groupKey of ["status_labels", "display", "weekly"]) {
        if (flat[groupKey] && typeof flat[groupKey] === "object") {
          Object.assign(flat, flat[groupKey]);
          delete flat[groupKey];
        }
      }
      this._config = { ...this._config, ...flat };
      this._fireConfigChanged();
    });

    this._form = form;
    this.appendChild(form);
  }

  _schema() {
    return [
      { name: "entity", required: true, selector: { entity: {} } },
      { name: "label", selector: { text: {} } },
      this._resetAttributeSchemaEntry(),
      { name: "idle_text", selector: { text: {} } },
      {
        type: "expandable",
        title: "Weekly usage bar",
        schema: [
          { name: "weekly_entity", selector: { entity: {} } },
          { name: "weekly_label", selector: { text: {} } },
          { name: "weekly_reset_entity", selector: { entity: {} } },
          {
            name: "weekly_period_days",
            selector: { number: { min: 1, max: 31, step: 1, mode: "box" } },
          },
          {
            name: "pace_band_minor",
            selector: { number: { min: 0, max: 50, step: 1, mode: "box" } },
          },
          {
            name: "pace_band_major",
            selector: { number: { min: 1, max: 90, step: 1, mode: "box" } },
          },
          { name: "label_pace_under_major", selector: { text: {} } },
          { name: "label_pace_under", selector: { text: {} } },
          { name: "label_pace_on", selector: { text: {} } },
          { name: "label_pace_over", selector: { text: {} } },
          { name: "label_pace_over_major", selector: { text: {} } },
        ],
      },
      {
        type: "expandable",
        title: "Status labels & thresholds",
        schema: [
          { name: "label_nominal", selector: { text: {} } },
          { name: "label_elevated", selector: { text: {} } },
          { name: "label_high", selector: { text: {} } },
          { name: "label_critical", selector: { text: {} } },
          {
            name: "band_elevated",
            selector: { number: { min: 0, max: 100, step: 1, mode: "box" } },
          },
          {
            name: "band_high",
            selector: { number: { min: 0, max: 100, step: 1, mode: "box" } },
          },
          {
            name: "band_critical",
            selector: { number: { min: 0, max: 100, step: 1, mode: "box" } },
          },
        ],
      },
      {
        type: "expandable",
        title: "Display",
        schema: [
          {
            name: "decimals",
            selector: { number: { min: 0, max: 2, step: 1, mode: "box" } },
          },
          {
            name: "card_height",
            selector: { number: { min: 120, max: 600, step: 10, mode: "box" } },
          },
        ],
      },
    ];
  }

  _resetAttributeSchemaEntry() {
    // True dropdown of the selected entity's actual attributes, with a
    // working clear control, built from HA's attribute selector. Falls
    // back to a generic (unfiltered) attribute selector if no entity is
    // chosen yet, since the selector requires *some* schema either way.
    const entityId = this._config && this._config.entity;
    return {
      name: "reset_attribute",
      selector: {
        attribute: entityId ? { entity_id: entityId } : {},
      },
    };
  }

  _labelFor(schemaItem) {
    const labels = {
      entity: "Entity (required)",
      label: "Card Title",
      reset_attribute: "Entity attribute (optional)",
      idle_text: "Idle text (shown when reset is unknown)",
      weekly_entity: "Weekly usage entity",
      weekly_label: "Weekly bar label",
      weekly_reset_entity: "Weekly reset entity (separate sensor)",
      weekly_period_days: "Weekly window (days)",
      pace_band_minor: "On pace tolerance (± pts)",
      pace_band_major: "Well over/under threshold (pts)",
      label_pace_under_major: "Message: well under pace",
      label_pace_under: "Message: under pace",
      label_pace_on: "Message: on pace",
      label_pace_over: "Message: over pace",
      label_pace_over_major: "Message: well over pace",
      label_nominal: "Nominal label",
      label_elevated: "Elevated label",
      label_high: "High Load label",
      label_critical: "Critical label",
      band_elevated: "Elevated at (%)",
      band_high: "High Load at (%)",
      band_critical: "Critical at (%)",
      decimals: "Decimal places",
      card_height: "Card height (px)",
    };
    return labels[schemaItem.name] || schemaItem.name;
  }

  _fireConfigChanged() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }
}
customElements.define("claude-usage-gauge-card-editor", ClaudeUsageGaugeCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "claude-usage-gauge-card",
  name: "Claude Usage Gauge",
  description: "Needle gauge with in-arc readout plus weekly usage bar, bound to Claude usage sensors.",
});

// Prints the loaded version to the browser console so you can confirm which
// build HACS served. Bump the version string on each release.
console.info(
  "%c CLAUDE-USAGE-GAUGE-CARD %c v1.0.0 ",
  "color:white;background:#0288b7;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px;",
  "color:#0288b7;background:#e8f4f8;font-weight:700;border-radius:0 3px 3px 0;padding:2px 6px;"
);
