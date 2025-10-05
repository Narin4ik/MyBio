const musicConfig = {
  listUrl: "music/music_list.json",
  audioBasePath: "music/audio/",
  imageBasePath: "music/images/",
  defaultVolume: 0.3
};

const musicState = {
  elements: {},
  tracks: [],
  queue: [],
  queueIndex: 0,
  audio: null,
  isPlaying: false
};

document.addEventListener("DOMContentLoaded", () => {
  const loaderEl = document.getElementById("app-loader");
  if (loaderEl) {
    document.documentElement.style.overflow = "hidden";
    const delay = 1000 + Math.floor(Math.random() * 2001); // 1–3 сек
    setTimeout(() => {
      loaderEl.classList.add("is-hidden");
      setTimeout(() => {
        loaderEl.remove();
        document.documentElement.style.overflow = "";
      }, 400);
    }, delay);
  }

  const block = document.querySelector(".music-block");
  if (!block) return;

  if (isMobilePhone()) {
    document.body.classList.add("is-phone");
    block.dataset.state = "ready";
    block.dataset.playback = "paused";
    return;
  }

  musicState.elements = {
    block,
    card: block.querySelector(".music-card"),
    track: block.querySelector(".music-track"),
    artist: block.querySelector(".music-artist"),
    cover: block.querySelector(".music-cover"),
    coverImage: block.querySelector(".music-cover-image"),
    prevBtn: block.querySelector('[data-action="prev"]'),
    nextBtn: block.querySelector('[data-action="next"]'),
    toggleBtn: block.querySelector('[data-action="toggle"]'),
    volumeBtn: block.querySelector('[data-action="volume"]'),
    volumeWrap: block.querySelector(".music-volume"),
    volumeSlider: block.querySelector(".music-volume-slider"),
    iconLink: block.querySelector(".music-icon-link"),
    progressWrap: block.querySelector(".music-progress"),
    progressSlider: block.querySelector(".music-progress-slider"),
    timeCurrent: block.querySelector(".music-time-current"),
    timeTotal: block.querySelector(".music-time-total")
  };

  setupUI();
  loadTracks();
});

function renderArtistMarkdown(md) {
  const baseHref = document.baseURI || window.location.href;
  const escape = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const resolveUrl = v => {
    if (!v) return "#";
    try { return new URL(v, baseHref).toString(); } catch { return "#"; }
  };
  const rx = /\[([^\]]+)\]\(([^)]+)\)/g;
  let out = [], i = 0, m;
  while ((m = rx.exec(md || ""))) {
    const before = md.slice(i, m.index);
    if (before) out.push(escape(before));
    out.push(`<a href="${resolveUrl(m[2])}" target="_blank" rel="noopener noreferrer">${escape(m[1])}</a>`);
    i = m.index + m[0].length;
  }
  out.push(escape((md || "").slice(i)));
  return out.join("");
}

function setupUI() {
  const {
    block,
    prevBtn,
    nextBtn,
    toggleBtn,
    volumeBtn,
    volumeWrap,
    volumeSlider,
    cover,
    coverImage,
    track,
    artist,
    iconLink
  } = musicState.elements;

  if (artist && artist.tagName === "A") {
    const span = document.createElement("span");
    span.className = artist.className;
    artist.replaceWith(span);
    musicState.elements.artist = span;
  }

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = musicConfig.defaultVolume;
  audio.autoplay = false;
  audio.muted = false;

  audio.addEventListener("ended", handleNextTrack);
  audio.addEventListener("play", () => setPlaybackMode(true));
  audio.addEventListener("pause", () => setPlaybackMode(false));
  audio.addEventListener("waiting", () => setBlockMode("loading"));
  audio.addEventListener("canplay", () => setBlockMode("ready"));
  audio.addEventListener("error", () => {
    console.error("[music] audio error:", musicState.audio ? musicState.audio.src : "");
    handleError();
  });

  musicState.audio = audio;

  if (!audio.isConnected) {
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);
  }

  setupProgressUI();
  bindAudioProgress();

  if (volumeSlider && volumeWrap && volumeBtn) {

    const applyUI = v => {
      const pct = Math.round(v * 100);
      volumeSlider.style.setProperty("--p", pct + "%");
      volumeWrap.style.setProperty("--p", pct + "%");
    };

    const setVol = (v, user = false) => {
      const val = Math.max(0, Math.min(1, Number(v)));
      musicState.audio.volume = val;
      if (user && val > 0) musicState.audio.muted = false;
      if (val === 0) musicState.audio.muted = true;
      applyUI(val);
      volumeBtn.classList.toggle("muted", musicState.audio.muted);
      volumeSlider.value = String(val);
    };

    volumeSlider.min = 0;
    volumeSlider.max = 1;
    volumeSlider.step = 0.01;
    volumeSlider.value = musicConfig.defaultVolume;
    setVol(musicConfig.defaultVolume, false);
    volumeBtn.classList.toggle("muted", false);

    volumeBtn.addEventListener("click", () => {
      musicState.audio.muted = !musicState.audio.muted;
      volumeBtn.classList.toggle("muted", musicState.audio.muted);
      const v = musicState.audio.muted ? 0 : (parseFloat(volumeSlider.value) || musicConfig.defaultVolume);
      applyUI(v);
    });

    volumeSlider.addEventListener("input", e => setVol(e.target.value, true));

    volumeSlider.addEventListener("pointerdown", e => {
      volumeSlider.setPointerCapture(e.pointerId);
      const r = volumeSlider.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      setVol(ratio, true);
    });
    volumeSlider.addEventListener("pointermove", e => {
      if (volumeSlider.hasPointerCapture(e.pointerId)) {
        const r = volumeSlider.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        setVol(ratio, true);
      }
    });
    volumeSlider.addEventListener("pointerup", e => {
      volumeSlider.releasePointerCapture(e.pointerId);
    });

    musicState.audio.addEventListener("volumechange", () => {
      const v = musicState.audio.muted ? 0 : musicState.audio.volume;
      applyUI(v);
      volumeBtn.classList.toggle("muted", musicState.audio.muted);
      volumeSlider.value = String(v);
    });
  }

  if (prevBtn) prevBtn.addEventListener("click", () => moveInQueue(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => moveInQueue(1));
  if (toggleBtn) toggleBtn.addEventListener("click", () => togglePlayback());

  if (cover) cover.href = "#";
  if (coverImage) coverImage.src = "media/images/sitelogo.svg";
  if (track) { track.textContent = "Загрузка..."; track.href = "#"; }
  if (iconLink) iconLink.href = "#";

  setBlockMode("loading");
  setPlaybackMode(false);
}

function loadTracks() {
  if (Array.isArray(window.MUSIC_LIST) && window.MUSIC_LIST.length) {
    musicState.tracks = window.MUSIC_LIST.map(normalizeTrack);
    buildQueue();
    preloadPlaylistAssets(musicState.tracks, 4);
    autoStart();
    return;
  }

  const resolvedListUrl = new URL(
    musicConfig.listUrl,
    document.baseURI || window.location.href
  ).toString();

  fetch(resolvedListUrl, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error("list_load_failed"))))
    .then(data => {
      if (!Array.isArray(data) || !data.length) throw new Error("list_empty");
      musicState.tracks = data.map(normalizeTrack);
      buildQueue();
      preloadPlaylistAssets(musicState.tracks, 4);
      autoStart();
    })
    .catch(err => {
      console.error("[music] loadTracks", err);
      handleError();
    });
}

async function autoStart() {
  if (!musicState.queue.length) { handleError(); return; }
  const qIndex = musicState.queueIndex % musicState.queue.length;
  const tIndex = musicState.queue[qIndex];
  const track = musicState.tracks[tIndex];
  if (!track?.audioSrc) { handleError(); return; }

  const { audio } = musicState;
  const vol = parseFloat(musicState.elements.volumeSlider?.value ?? musicConfig.defaultVolume) || musicConfig.defaultVolume;

  setBlockMode("loading");
  renderTrack(track);

  audio.muted = true;
  audio.volume = vol;
  audio.src = track.audioSrc;
  audio.load();

  try {
    await audio.play();
    setBlockMode("ready");
    setPlaybackMode(true);
    const unmute = () => {
      audio.muted = false;
      audio.volume = vol;
      window.removeEventListener("pointerdown", unmute);
      window.removeEventListener("keydown", unmute);
      window.removeEventListener("touchstart", unmute);
    };
    window.addEventListener("pointerdown", unmute, { once: true });
    window.addEventListener("keydown", unmute, { once: true });
    window.addEventListener("touchstart", unmute, { once: true });
  } catch (e) {
    setBlockMode("ready");
    setPlaybackMode(false);
    audio.muted = false;
    audio.volume = vol;
  }
}

function normalizeTrack(entry) {
  const isAbsolute = value => /^https?:\/\//i.test(value || "");
  const baseHref = document.baseURI || window.location.href;
  const audioBase = new URL(musicConfig.audioBasePath, baseHref);
  const imageBase = new URL(musicConfig.imageBasePath, baseHref);

  const resolveUrl = (value, base) => {
    if (!value) return "";
    if (isAbsolute(value)) return value;
    return new URL(value, base).toString();
  };

  const makeId = () =>
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const audioSrc = resolveUrl(entry.fileName, audioBase);
  const coverSrcCandidate = resolveUrl(entry.coverImage, imageBase);
  const trackUrl = resolveUrl(entry.trackUrl, baseHref) || "#";

  return {
    id: entry.id || makeId(),
    title: entry.title || "Без названия",
    artist: entry.artist || "",
    trackUrl,
    audioSrc,
    coverSrc: coverSrcCandidate || "media/images/sitelogo.svg"
  };
}

function buildQueue() {
  const indices = musicState.tracks.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  musicState.queue = indices;
  musicState.queueIndex = 0;
}

function playCurrentTrack() {
  if (!musicState.queue.length) { handleError(); return; }

  const queueIndex = musicState.queueIndex % musicState.queue.length;
  const trackIndex = musicState.queue[queueIndex];
  const track = musicState.tracks[trackIndex];
  if (!track || !track.audioSrc) { handleError(); return; }

  const { audio } = musicState;

  setBlockMode("loading");
  renderTrack(track);

  audio.src = track.audioSrc;
  audio.load();
  audio.muted = false;
  audio.volume = parseFloat(musicState.elements.volumeSlider?.value ?? musicConfig.defaultVolume) || musicConfig.defaultVolume;

  audio.play()
    .then(() => {
      musicState.isPlaying = true;
      setPlaybackMode(true);
      setBlockMode("ready");
    })
    .catch(error => {
      musicState.isPlaying = false;
      setPlaybackMode(false);
      handleError();
    });
}

function togglePlayback() {
  if (!musicState.audio) {
    return;
  }

  if (!musicState.audio.src) {
    musicState.audio.muted = false;
    musicState.audio.volume = parseFloat(musicState.elements.volumeSlider?.value ?? musicConfig.defaultVolume) || musicConfig.defaultVolume;
    playCurrentTrack();
    return;
  }

  if (musicState.audio.paused) {
    if (musicState.audio.muted) {
      musicState.audio.muted = false;
      musicState.audio.volume = parseFloat(musicState.elements.volumeSlider?.value ?? musicConfig.defaultVolume) || musicConfig.defaultVolume;
    }
    musicState.audio.play().catch(error => {
      console.error("[music] resume", error);
      setPlaybackMode(false);
    });
  } else {
    musicState.audio.pause();
  }
}

function moveInQueue(step) {
  if (!musicState.queue.length) return;
  musicState.queueIndex = (musicState.queueIndex + step + musicState.queue.length) % musicState.queue.length;
  if (musicState.audio) {
    musicState.audio.muted = false;
    musicState.audio.volume = parseFloat(musicState.elements.volumeSlider?.value ?? musicConfig.defaultVolume) || musicConfig.defaultVolume;
  }
  playCurrentTrack();
}

function handleNextTrack() {
  moveInQueue(1);
}

function setBlockMode(mode) {
  const { block } = musicState.elements;
  if (!block) {
    return;
  }
  block.dataset.state = mode;
}

function setPlaybackMode(isPlaying) {
  const { block, toggleBtn } = musicState.elements;
  if (block) {
    block.dataset.playback = isPlaying ? "playing" : "paused";
  }
  if (toggleBtn) {
    toggleBtn.classList.toggle("playing", isPlaying);
    toggleBtn.setAttribute("aria-label", isPlaying ? "Пауза" : "Воспроизвести");
  }
  musicState.isPlaying = isPlaying;
}

function handleError(message) {
  if (message) {
    console.error("[music]", message);
  }
  setBlockMode("error");
  setPlaybackMode(false);
  if (musicState.audio) {
    musicState.audio.pause();
  }
}

function formatTime(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}

function formatTime(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}

function setupProgressUI() {
  const { progressSlider, timeCurrent, timeTotal } = musicState.elements;
  if (timeCurrent) timeCurrent.textContent = "0:00";
  if (timeTotal)   timeTotal.textContent   = "0:00";
  if (!progressSlider) return;

  const updateBg = () => {
    const max = parseFloat(progressSlider.max) || 0;
    const val = parseFloat(progressSlider.value) || 0;
    const pct = max > 0 ? (val / max) * 100 : 0;
    progressSlider.style.setProperty("--p", pct + "%");
  };

  let seeking = false;
  const commit = v => {
    seeking = false;
    const value = Math.max(0, Math.min(parseFloat(progressSlider.max)||0, v));
    progressSlider.value = value;
    updateBg();
    if (musicState.audio) musicState.audio.currentTime = value;
    if (timeCurrent) timeCurrent.textContent = formatTime(value);
  };

  progressSlider.min = 0;
  progressSlider.max = 0;
  progressSlider.step = 0.1;
  progressSlider.value = 0;
  updateBg();

  progressSlider.addEventListener("pointerdown", e => {
    const r = progressSlider.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    commit(ratio * (parseFloat(progressSlider.max) || 0));
    seeking = true;
  });
  progressSlider.addEventListener("pointerup", () => { seeking = false; });
  progressSlider.addEventListener("change", e => commit(parseFloat(e.target.value)||0));
  progressSlider.addEventListener("input", e => {
    const v = parseFloat(e.target.value) || 0;
    if (timeCurrent) timeCurrent.textContent = formatTime(v);
    updateBg();
  });

  progressSlider._isSeeking = () => seeking;
  progressSlider._updateBg = updateBg;
}

function bindAudioProgress() {
  const { progressSlider, timeCurrent, timeTotal } = musicState.elements;
  const a = musicState.audio;
  if (!a) return;

  a.addEventListener("loadedmetadata", () => {
    const d = isFinite(a.duration) ? a.duration : 0;
    if (progressSlider) {
      progressSlider.max = d;
      progressSlider._updateBg && progressSlider._updateBg();
    }
    if (timeTotal) timeTotal.textContent = formatTime(d);
  });

  a.addEventListener("timeupdate", () => {
    if (progressSlider && !(progressSlider._isSeeking && progressSlider._isSeeking())) {
      progressSlider.value = a.currentTime || 0;
      progressSlider._updateBg && progressSlider._updateBg();
    }
    if (timeCurrent) timeCurrent.textContent = formatTime(a.currentTime || 0);
  });
}

function renderTrack(track) {
  const {
    coverImage,
    cover,
    track: trackLink,
    artist,
    volumeWrap,
    progressSlider,
    timeCurrent,
    timeTotal
  } = musicState.elements;

  if (coverImage) coverImage.src = track.coverSrc || "media/images/sitelogo.svg";
  if (cover) cover.href = track.trackUrl || "#";
  if (trackLink) { trackLink.textContent = track.title || "Без названия"; trackLink.href = track.trackUrl || "#"; }

  if (artist) {
    artist.removeAttribute && artist.removeAttribute("href");
    artist.innerHTML = renderArtistMarkdown(track.artist || "");
  }

  if (volumeWrap) volumeWrap.classList.remove("active");
  if (progressSlider) { progressSlider.value = 0; progressSlider.max = 0; progressSlider.style.setProperty("--p","0%"); }
  if (timeCurrent) timeCurrent.textContent = "0:00";
  if (timeTotal)   timeTotal.textContent   = "0:00";
}

function isMobilePhone() {
  const ua = navigator.userAgent || navigator.vendor || "";
  const isiPhone = /iPhone/i.test(ua);
  const isAndroidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);
  const isWindowsPhone = /Windows Phone/i.test(ua);
  const isBlackBerryPhone = /BlackBerry|BB10/i.test(ua) && /Mobile/i.test(ua);
  const isIPad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  return (isiPhone || isAndroidPhone || isWindowsPhone || isBlackBerryPhone) && !(isIPad || isAndroidTablet);
}

function preloadTrackMedia(track){
  if (!track) return;
  if (track.coverSrc){
    const l1 = document.createElement("link");
    l1.rel = "preload";
    l1.as = "image";
    l1.href = track.coverSrc;
    document.head.appendChild(l1);
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = track.coverSrc;
  }
  if (track.audioSrc){
    const l2 = document.createElement("link");
    l2.rel = "preload";
    l2.as = "audio";
    l2.href = track.audioSrc;
    document.head.appendChild(l2);
    fetch(track.audioSrc, { cache: "force-cache" }).catch(()=>{});
  }
}

function preloadPlaylistAssets(tracks, eagerCount = 4){
  if (!Array.isArray(tracks) || !tracks.length) return;
  const eager = tracks.slice(0, eagerCount);
  eager.forEach(preloadTrackMedia);
  const rest = tracks.slice(eagerCount);
  const loadRest = () => rest.forEach(preloadTrackMedia);
  if ("requestIdleCallback" in window){
    requestIdleCallback(loadRest, { timeout: 3000 });
  } else {
    window.addEventListener("load", loadRest, { once: true });
  }
}