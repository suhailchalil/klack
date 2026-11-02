/**
 * KLACK — motion system.
 *
 * One rAF loop drives every transform on the page. Its inputs are scroll, a
 * damped pointer, and elapsed time — the last two only ever move the hero
 * planes, and only by a few pixels and a few degrees. Nothing in the loop reads
 * layout: element geometry is measured once on init and again on resize / font
 * load, then only `transform` and `opacity` are written.
 */

import { AudioEngine } from "./audio.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ==========================================================================
   Viewport + geometry cache
   ========================================================================== */

let vh = window.innerHeight;
let vw = window.innerWidth;

const hero = $("#hero");
const stage = $("#heroStage");
const heroUi = $("#heroUi");

/** Planes read their depth straight off the markup, so the layer order and
 *  the motion order can never drift apart. */
const planes = $$(".plane", stage).map((el, i) => ({
  el,
  lag: parseFloat(el.dataset.lag) || 0,
  isProduct: el.classList.contains("plane--product"),
  isType: el.classList.contains("plane--type"),
  // Detuned so the two planes never crest together and the drift never
  // resolves into a visible loop.
  phase: i * 2.3,
}));

/* Pointer, damped. Targets are set on the event; the loop eases toward them so
   the motion keeps gliding after the cursor stops. */
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };

if (!reduced) {
  window.addEventListener(
    "pointermove",
    (e) => {
      // vw/vh are cached — the pointer path never touches layout.
      ptr.tx = (e.clientX / vw - 0.5) * 2;
      ptr.ty = (e.clientY / vh - 0.5) * 2;
    },
    { passive: true },
  );
}

const drifters = $$("[data-parallax], [data-drift]").map((el) => ({
  el,
  target: el.querySelector("img") || el,
  parallax: parseFloat(el.dataset.parallax) || 0,
  drift: parseFloat(el.dataset.drift) || 0,
  top: 0,
  height: 0,
}));

let heroHeight = 0;

function measure() {
  vh = window.innerHeight;
  vw = window.innerWidth;
  heroHeight = hero ? hero.offsetHeight : vh;

  const pageTop = window.scrollY;
  for (const d of drifters) {
    const r = d.el.getBoundingClientRect();
    d.top = r.top + pageTop;
    d.height = r.height;
  }
}

/* ==========================================================================
   The single render loop
   ========================================================================== */

let running = false;
let heroVisible = true;

function frame() {
  if (!running) return;

  const y = window.scrollY;
  const t = performance.now() / 1000;

  // One eased step per frame toward the pointer target.
  ptr.x += (ptr.tx - ptr.x) * 0.04;
  ptr.y += (ptr.ty - ptr.y) * 0.04;

  if (heroVisible) {
    const p = clamp(y / heroHeight, 0, 1);

    for (const pl of planes) {
      // positive lag = trails the page = reads as further away
      const ty = y * pl.lag;
      const scale = pl.isProduct ? 1 + p * 0.055 : 1;

      /*
        Depth drives everything below: the product sits nearest the camera so
        it leads, the wordmark trails at 42%. Two planes moving by *different*
        amounts is what reads as three dimensions — a single shared tilt just
        looks like the whole page is wobbling.

        The drift periods are ~30s and ~39s and deliberately coprime with the
        tilt, so the scene never settles into a pulse you can count.
      */
      const depth = pl.isProduct ? 1 : 0.42;
      const floatY = Math.sin(t * 0.21 + pl.phase) * 9 * depth;
      const floatX = Math.cos(t * 0.16 + pl.phase) * 6 * depth;
      const tx = ptr.x * 16 * depth + floatX;
      const rotY = ptr.x * 4.6 * depth;
      const rotX = -ptr.y * 3.2 * depth;

      pl.el.style.transform =
        `translate3d(${tx.toFixed(2)}px, ${(ty + floatY).toFixed(2)}px, 0)` +
        ` rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg)` +
        (scale === 1 ? "" : ` scale(${scale.toFixed(4)})`);

      if (pl.isType) pl.el.style.opacity = (1 - p * 0.5).toFixed(3);
    }

    // the caption layer clears out well before the scene does
    heroUi.style.opacity = clamp(1 - p * 2.4, 0, 1).toFixed(3);
  }

  for (const d of drifters) {
    // -1 fully below the fold → +1 fully above it
    const rel = (y + vh - d.top) / (vh + d.height) - 0.5;
    if (rel < -0.62 || rel > 0.62) continue;

    if (d.parallax) {
      d.target.style.transform = `translate3d(0, ${(-rel * d.parallax * d.height).toFixed(2)}px, 0)`;
    } else {
      d.target.style.transform = `translate3d(calc(-50% + ${(-rel * d.drift).toFixed(2)}px), -50%, 0)`;
    }
  }

  requestAnimationFrame(frame);
}

function start() {
  if (running || reduced) return;
  running = true;
  requestAnimationFrame(frame);
}
function stop() {
  running = false;
}

/* stop painting the hero planes once the scene is off screen */
if (hero && "IntersectionObserver" in window) {
  new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
    },
    { rootMargin: "10% 0px" },
  ).observe(hero);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
  else start();
});

let resizeTimer;
window.addEventListener(
  "resize",
  () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 140);
  },
  { passive: true },
);

/* ==========================================================================
   Reveals
   ========================================================================== */

/*
  Keycaps entrance. Opt-in and self-cancelling: the class is added now and
  taken off once the longest animation (1310ms delay + 900ms) has finished.
  Removing it restores the section's ordinary, visible styles — so even if the
  animation never ran, nothing is left sitting at opacity 0.
*/
if (!reduced) {
  document.documentElement.classList.add("caps-anim");
  window.setTimeout(() => document.documentElement.classList.remove("caps-anim"), 2600);
}

const revealables = $$(".reveal, .reveal-img, .reveal-film");

/* The keycap film is decorative and autoplays. Someone asking for less motion
   gets the poster frame instead — CSS cannot stop a <video>, so it is paused
   here rather than left running behind a disabled transition. */
const capsFilm = $("#capsFilm");
if (capsFilm && reduced) {
  capsFilm.removeAttribute("autoplay");
  capsFilm.removeAttribute("loop");
  capsFilm.pause();
}

if (reduced || !("IntersectionObserver" in window)) {
  revealables.forEach((el) => el.classList.add("is-in"));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  revealables.forEach((el) => io.observe(el));
}

/* ==========================================================================
   Navigation
   ========================================================================== */

const nav = $("#nav");
const menuBtn = $("#menuBtn");
const drawer = $("#drawer");

let lastY = window.scrollY;
window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    nav.classList.toggle("is-stuck", y > 40);

    // Once the scene starts moving, the wordmark slides up under the bar and
    // the links stop being legible against it. Retract on the way down, return
    // on the way up — and hold the state through the dead zone, so coasting to
    // a stop mid-page doesn't flick the bar back into the type.
    if (drawer.classList.contains("is-open") || y <= 130) {
      nav.classList.remove("is-hidden");
    } else if (y > lastY + 4) {
      nav.classList.add("is-hidden");
    } else if (y < lastY - 4) {
      nav.classList.remove("is-hidden");
    }
    if (Math.abs(y - lastY) > 4) lastY = y;
  },
  { passive: true },
);

function setDrawer(open) {
  menuBtn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    drawer.hidden = false;
    $$("a", drawer).forEach((a, i) => a.style.setProperty("--d", `${80 + i * 70}ms`));
    requestAnimationFrame(() => drawer.classList.add("is-open"));
  } else {
    drawer.classList.remove("is-open");
    setTimeout(() => {
      if (!drawer.classList.contains("is-open")) drawer.hidden = true;
    }, 620);
  }
}

menuBtn.addEventListener("click", () => setDrawer(menuBtn.getAttribute("aria-expanded") !== "true"));
$$("a", drawer).forEach((a) => a.addEventListener("click", () => setDrawer(false)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") setDrawer(false);
});

/* ==========================================================================
   Accessories — the row list drives which plate is on
   ========================================================================== */

const accList = $("#accList");

if (accList) {
  const accRows = $$(".acc-row", accList);
  const accShots = $$(".acc__shot");

  // pointer and focus preview; a click locks, and leaving the list falls back
  // to whatever is locked
  let locked = accRows[0].dataset.acc;

  const showAcc = (key) => {
    for (const row of accRows) row.classList.toggle("is-active", row.dataset.acc === key);
    for (const shot of accShots) shot.classList.toggle("is-on", shot.dataset.acc === key);
  };

  for (const row of accRows) {
    const key = row.dataset.acc;
    row.addEventListener("pointerenter", () => showAcc(key));
    row.addEventListener("focusin", () => showAcc(key));
    row.querySelector("button").addEventListener("click", () => {
      locked = key;
      showAcc(key);
    });
  }

  accList.addEventListener("pointerleave", () => showAcc(locked));
}

/* ==========================================================================
   Keystroke sound — the dial in the navigation
   ========================================================================== */

const audio = new AudioEngine();
const dial = $("#soundDial");
let soundOn = false;

dial.addEventListener("click", () => {
  soundOn = !soundOn;
  dial.setAttribute("aria-pressed", String(soundOn));
  if (soundOn) audio.playThock(0);
});

document.addEventListener("keydown", (e) => {
  if (!soundOn || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  audio.playThock((Math.random() - 0.5) * 1.4);
});

/* ==========================================================================
   Index sign-up
   ========================================================================== */

const joinForm = $("#joinForm");
const joinStatus = $("#joinStatus");

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#joinEmail");
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
  joinStatus.textContent = ok ? "Confirmed — you are on the index" : "Enter a valid email address";
  joinStatus.style.color = ok ? "" : "#8a8a8a";
  joinStatus.classList.add("is-on");
  if (ok) {
    input.value = "";
    input.blur();
  }
});

/* ==========================================================================
   Boot
   ========================================================================== */

function boot() {
  measure();
  document.body.classList.remove("is-loading");
  start();
}

const heroImg = $("#heroProduct");

if (heroImg && !heroImg.complete) {
  heroImg.addEventListener("load", boot, { once: true });
  heroImg.addEventListener("error", boot, { once: true });
  setTimeout(boot, 2200);
} else {
  requestAnimationFrame(boot);
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(measure);
}
window.addEventListener("load", measure);
