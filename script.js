const themeAliases = [
  { key: "pain", match: /(hurt|pain|worth|die|destroy|grief|cry|burn|suffocating|numb|empty|lose)/i },
  { key: "obsession", match: /(obsession|need|want|closer|purpose|keep me close|i need|falling|love)/i },
  { key: "distance", match: /(leave|let me go|forgot|not home|away|anywhere|out|get|school|real life)/i },
  { key: "sleep", match: /(dream|sleep|night|comet|limbo|treehouse|midnight|survive)/i },
  { key: "rage", match: /(trash|bad person|fuck up|attack|rot|the funeral|secret|you're not)/i },
  { key: "memory", match: /(remember|temporary|home|nothing is real|history|story|when you're not home|closer)/i }
];

const knownShortVideoIds = window.mhieShortVideoIds || new Set();
const existingCatalogVideoIds = new Set((window.mhieMusicData || []).map(({ id }) => id));
const shortTitlePattern = /shorts|#short|#fyp|#dreamcore|#halloween|#nostalgia|#scary|#ambient|#creepy/i;

const ARCHIVE_REFRESH_INTERVAL = 10 * 24 * 60 * 60 * 1000;
const ARCHIVE_REFRESH_STORAGE_KEY = "mhie-youtube-last-refresh-v3";
const ARCHIVE_CATALOG_STORAGE_KEY = "mhie-youtube-catalog-with-dates-v1";
const YOUTUBE_API_KEYS = [
  "AIzaSyAep5lAgDCA_uY38qP0AmfP2TyuU8iQTkc",
  "AIzaSyB8fJ84sxvUs0ye766ZrFQ7l_FanUmrs1Q"
];
let activeYouTubeApiKeyIndex = 0;
const YOUTUBE_CHANNEL_ID = "UCADJhczGwtPelGm0EqVi3Mg";

function buildMusicData(data = []) {
  return (data || []).map((track, index) => {
    const publishedYear = track.publishedAt?.slice(0, 4);
    const year = track.year || publishedYear || "unknown";
    const isShort = knownShortVideoIds.has(track.id)
      || (!existingCatalogVideoIds.has(track.id) && shortTitlePattern.test(track.title));
    const themes = Array.from(new Set([
      ...((track.themes && track.themes.length) ? track.themes : []),
      ...themeAliases.filter(({ match }) => match.test(track.title)).map(({ key }) => key)
    ])).filter(Boolean);

    return {
      ...track,
      year,
      themes: themes.length ? themes : ["archive"],
      type: "archive",
      isShort
    };
  });
}

function buildShortsData(data = []) {
  return data.filter((track) => track.isShort).slice(0, 8);
}

function readCachedCatalog() {
  try {
    const cachedCatalog = JSON.parse(window.localStorage?.getItem(ARCHIVE_CATALOG_STORAGE_KEY) || "null");
    if (Array.isArray(cachedCatalog) && cachedCatalog.length) return cachedCatalog;
  } catch (error) {
    console.warn("Could not read the cached video catalog.", error);
  }
  return window.mhieMusicData || [];
}

window.mhieMusicData = readCachedCatalog();
let musicData = buildMusicData(window.mhieMusicData);
let shortsData = buildShortsData(musicData);

async function fetchYouTubeApi(resource, params) {
  let lastError;

  for (let attempt = 0; attempt < YOUTUBE_API_KEYS.length; attempt += 1) {
    const keyIndex = (activeYouTubeApiKeyIndex + attempt) % YOUTUBE_API_KEYS.length;
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    Object.entries({ ...params, key: YOUTUBE_API_KEYS[keyIndex] }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    let response;
    let result;
    try {
      response = await fetch(url);
      result = await response.json();
    } catch (error) {
      lastError = error;
      continue;
    }

    if (response.ok) {
      activeYouTubeApiKeyIndex = keyIndex;
      return result;
    }

    lastError = new Error(result.error?.message || `YouTube API returned ${response.status}.`);
    if (response.status !== 401 && response.status !== 403) throw lastError;
  }

  throw lastError || new Error("All YouTube API keys failed.");
}

async function fetchChannelUploads() {
  const channel = await fetchYouTubeApi("channels", {
    part: "contentDetails",
    id: YOUTUBE_CHANNEL_ID
  });
  const uploadsPlaylistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Could not find the channel uploads playlist.");

  const uploads = [];
  let pageToken = "";
  do {
    const params = {
      part: "snippet",
      playlistId: uploadsPlaylistId,
      maxResults: "50"
    };
    if (pageToken) params.pageToken = pageToken;

    const page = await fetchYouTubeApi("playlistItems", params);
    page.items?.forEach(({ snippet }) => {
      const id = snippet.resourceId?.videoId;
      if (!id) return;
      uploads.push({
        id,
        title: snippet.title,
        publishedAt: snippet.publishedAt
      });
    });
    pageToken = page.nextPageToken || "";
  } while (pageToken);

  if (!uploads.length) throw new Error("The YouTube API returned no public uploads.");
  return uploads;
}

const storageKey = "mhie-archive-comments";
const commentList = document.querySelector("#comment-list");
const commentForm = document.querySelector("#comment-form");
const trackList = document.querySelector(".track-list");
const trackCount = document.querySelector("#track-count");
const trackSearch = document.querySelector("#track-search");
const trackYearFilters = document.querySelector("#track-year-filters");
const trackThemeFilters = document.querySelector("#track-theme-filters");
const trackFormatFilters = document.querySelector("#track-format-filters");
const playlistList = document.querySelector("#playlist-list");
const releaseList = document.querySelector("#release-list");
const releaseSearch = document.querySelector("#release-search");
const commentContext = document.querySelector("#comment-context");
const player = document.querySelector(".player");
const playerFrame = player.querySelector("iframe");
const playerEmpty = player.querySelector(".player-empty");
const playerTitle = player.querySelector(".player-title");
const playerYoutubeLink = player.querySelector(".player-youtube-link");
const playerControls = player.querySelector(".player-controls");
let currentTrackIndex = -1;
let currentTrackId = null;
let commentsRequestId = 0;
let activeTrackYear = "all";
let activeTrackTheme = "all";
let activeTrackFormat = "all";
const supabaseUrl = "https://twhxraiawepvrzhxcjem.supabase.co";
const supabaseCommentsEndpoint = `${supabaseUrl}/rest/v1/comments`;
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aHhyYWlhd2VwdnJ6aHhjamVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzgwMDYsImV4cCI6MjEwNDIxNDAwNn0.zh0Qv76V76F1_LHKu6jvZ4J-lMr8vY9eegqJz_5vxas";
const supabaseHeaders = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json"
};
const supabasePublicKey = "sb_publishable_v0aTMz9JPcgQc5Bd07mW8A_uQcTSlT2";
supabaseHeaders.apikey = supabasePublicKey;
supabaseHeaders.Authorization = `Bearer ${supabasePublicKey}`;

async function refreshArchiveData(force = false) {
  if (window.location.protocol === "file:" || YOUTUBE_API_KEYS.length === 0) {
    return false;
  }

  const now = Date.now();
  const lastRefresh = Number(window.localStorage?.getItem(ARCHIVE_REFRESH_STORAGE_KEY) || "0");

  if (!force && now - lastRefresh < ARCHIVE_REFRESH_INTERVAL) {
    return false;
  }

  try {
    window.mhieMusicData = await fetchChannelUploads();
    musicData = buildMusicData(window.mhieMusicData || []);
    shortsData = buildShortsData(musicData);
    try {
      window.localStorage?.setItem(ARCHIVE_CATALOG_STORAGE_KEY, JSON.stringify(window.mhieMusicData));
      window.localStorage?.setItem(ARCHIVE_REFRESH_STORAGE_KEY, String(now));
    } catch (error) {
      console.warn("Could not persist the refreshed video catalog.", error);
    }

    renderTracks(trackSearch.value, activeTrackYear, activeTrackTheme, activeTrackFormat);
    renderShorts();
    renderPlaylists();
    renderReleases(releaseSearch.value);
    return true;
  } catch (error) {
    console.warn("Archive refresh failed.", error);
    return false;
  }
}

function startArchiveRefreshSchedule() {
  refreshArchiveData(false);
  setInterval(() => {
    refreshArchiveData(false);
  }, ARCHIVE_REFRESH_INTERVAL);
}

function renderShorts() {
  const container = document.querySelector("#shorts-list");
  if (!container) return;

  container.innerHTML = "";

  shortsData.forEach((track) => {
    const card = document.createElement("a");
    card.className = "shorts-card";
    card.href = `https://www.youtube.com/watch?v=${track.id}`;
    card.target = "_blank";
    card.rel = "noreferrer";

    const thumb = document.createElement("span");
    thumb.className = "shorts-thumb";
    thumb.style.backgroundImage = `url(https://i.ytimg.com/vi/${track.id}/hqdefault.jpg)`;

    const meta = document.createElement("div");
    meta.className = "shorts-meta";
    meta.innerHTML = `<h3>${escapeHtml(track.title)}</h3><span>short video</span>`;

    card.append(thumb, meta);
    container.append(card);
  });
}

function renderReleases(query = "") {
  releaseList.innerHTML = "";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleReleases = window.mhieReleaseData.filter((release) => release.title.toLowerCase().includes(normalizedQuery));

  visibleReleases.forEach((release, index) => {
    const link = document.createElement("a");
    link.className = "release-card";
    link.href = `https://www.youtube.com/playlist?list=${release.id}`;
    link.target = "_blank";
    link.rel = "noreferrer";

    const cover = document.createElement("span");
    cover.className = "release-card-cover";
    cover.textContent = String(window.mhieReleaseData.indexOf(release) + 1).padStart(3, "0");

    const title = document.createElement("span");
    title.className = "release-card-title";
    title.textContent = release.title;

    const meta = document.createElement("span");
    meta.className = "release-card-meta";
    meta.textContent = "playlist ↗";

    link.append(cover, title, meta);
    releaseList.append(link);
  });
}

function renderPlaylists() {
  playlistList.innerHTML = "";

  window.mhiePlaylistData.forEach((playlist, index) => {
    const link = document.createElement("a");
    link.className = "playlist-card";
    link.href = `https://www.youtube.com/playlist?list=${playlist.id}`;
    link.target = "_blank";
    link.rel = "noreferrer";

    const cover = document.createElement("span");
    cover.className = "playlist-cover";
    cover.textContent = `playlist ${String(index + 1).padStart(2, "0")}`;

    const content = document.createElement("div");
    content.innerHTML = `<h3>${escapeHtml(playlist.title)}</h3><p>playlist oficial · YouTube</p>`;

    const arrow = document.createElement("span");
    arrow.className = "playlist-arrow";
    arrow.textContent = "↗";

    link.append(cover, content, arrow);
    playlistList.append(link);
  });
}

function renderFilterPills() {
  const years = ["all", ...new Set(musicData.map((track) => track.year))];
  const themes = ["all", ...new Set(musicData.flatMap((track) => track.themes))];
  const formats = ["all", "shorts", "videos"];

  trackYearFilters.innerHTML = years.map((year) => {
    const label = year === "all" ? "all" : year;
    const activeClass = year === activeTrackYear ? "is-active" : "";
    return `<button type="button" class="filter-pill ${activeClass}" data-filter-group="year" data-filter-value="${year}">${label}</button>`;
  }).join("");

  trackThemeFilters.innerHTML = themes.map((theme) => {
    const label = theme === "all" ? "all" : theme;
    const activeClass = theme === activeTrackTheme ? "is-active" : "";
    return `<button type="button" class="filter-pill ${activeClass}" data-filter-group="theme" data-filter-value="${theme}">${label}</button>`;
  }).join("");

  trackFormatFilters.innerHTML = formats.map((format) => {
    const label = format === "all" ? "all" : format;
    const activeClass = format === activeTrackFormat ? "is-active" : "";
    return `<button type="button" class="filter-pill ${activeClass}" data-filter-group="format" data-filter-value="${format}">${label}</button>`;
  }).join("");

  trackFormatFilters.querySelectorAll(".filter-pill").forEach((button) => {
    button.addEventListener("click", () => {
      renderTracks(trackSearch.value, activeTrackYear, activeTrackTheme, button.dataset.filterValue);
    });
  });
}

function renderTracks(query = "", year = "all", theme = "all", format = "all") {
  trackList.innerHTML = "";
  activeTrackYear = year;
  activeTrackTheme = theme;
  activeTrackFormat = format;
  const shortsSection = document.querySelector("#shorts");
  if (shortsSection) shortsSection.hidden = format === "videos";

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTracks = musicData.filter((track) => {
    const matchesQuery = !normalizedQuery || track.title.toLowerCase().includes(normalizedQuery);
    const matchesYear = year === "all" || track.year === year;
    const matchesTheme = theme === "all" || track.themes.includes(theme);
    const matchesFormat = format === "all"
      || (format === "shorts" && track.isShort)
      || (format === "videos" && !track.isShort);
    return matchesQuery && matchesYear && matchesTheme && matchesFormat;
  });

  const groupedTracks = new Map();
  filteredTracks.forEach((track) => {
    if (!groupedTracks.has(track.year)) groupedTracks.set(track.year, []);
    groupedTracks.get(track.year).push(track);
  });

  trackCount.textContent = `${filteredTracks.length} videos`;
  renderFilterPills();

  if (filteredTracks.length === 0) {
    trackList.innerHTML = '<div class="track-group-header"><h3>no results</h3><span>try another search or filter</span></div>';
    return;
  }

  [...groupedTracks.entries()].sort(([a], [b]) => Number(b) - Number(a)).forEach(([groupYear, tracks]) => {
    const group = document.createElement("section");
    group.className = "track-group";

    const header = document.createElement("div");
    header.className = "track-group-header";
    header.innerHTML = `<h3>${escapeHtml(groupYear)}</h3><span>${tracks.length} tracks</span>`;
    group.append(header);

    tracks.forEach((track) => {
      const article = document.createElement("article");
      article.className = "track";
      article.dataset.filter = track.type;
      article.dataset.trackIndex = String(musicData.indexOf(track));

      const number = document.createElement("span");
      number.className = "track-number";
      number.textContent = String(musicData.indexOf(track) + 1).padStart(2, "0");

      const art = document.createElement("div");
      art.className = "track-art";
      art.setAttribute("role", "img");
      art.setAttribute("aria-label", `Capa de ${track.title}`);
      art.style.backgroundImage = `url(https://i.ytimg.com/vi/${track.id}/hqdefault.jpg)`;
      art.style.backgroundSize = "cover";
      art.style.backgroundPosition = "center";

      const info = document.createElement("div");
      info.className = "track-info";
      info.innerHTML = `<h3>${escapeHtml(track.title)}</h3><p>${escapeHtml(track.themes.join(" · "))}</p>`;

      const link = document.createElement("a");
      link.className = "text-link";
      link.href = `https://www.youtube.com/watch?v=${track.id}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "ouvir ↗";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        selectTrack(musicData.indexOf(track));
      });

      article.append(number, art, info, link);
      article.addEventListener("click", (event) => {
        if (event.target !== link) selectTrack(musicData.indexOf(track));
      });
      group.append(article);
    });

    trackList.append(group);
  });
}

function selectTrack(index) {
  const track = musicData[index];
  if (!track) return;

  currentTrackIndex = index;
  const playerOrigin = window.location.protocol === "http:" || window.location.protocol === "https:"
    ? `&origin=${encodeURIComponent(window.location.origin)}`
    : "";
  playerFrame.src = `https://www.youtube-nocookie.com/embed/${track.id}?autoplay=1&rel=0${playerOrigin}`;
  playerFrame.hidden = false;
  playerEmpty.hidden = true;
  playerTitle.textContent = track.title;
  currentTrackId = track.id;
  commentContext.textContent = `comments on: ${track.title}`;
  playerYoutubeLink.href = `https://www.youtube.com/watch?v=${track.id}`;
  playerYoutubeLink.hidden = false;
  player.hidden = false;

  trackList.querySelectorAll(".track").forEach((item) => item.classList.remove("is-playing"));
  const activeTrack = trackList.querySelector(`[data-track-index="${index}"]`);
  activeTrack?.classList.add("is-playing");
  loadComments(track.id);
  player.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function movePlayer(step) {
  if (musicData.length === 0) return;
  const nextIndex = currentTrackIndex < 0
    ? 0
    : (currentTrackIndex + step + musicData.length) % musicData.length;
  selectTrack(nextIndex);
}

async function getComments() {
  const response = await fetch(`${supabaseCommentsEndpoint}?select=*`, {
    headers: supabaseHeaders
  });

  if (!response.ok) {
    throw new Error(`Supabase respondeu com status ${response.status}.`);
  }

  return response.json();
}

const youtubeCommentsCache = new Map();

async function getYouTubeComments(videoId) {
  if (youtubeCommentsCache.has(videoId)) return youtubeCommentsCache.get(videoId);

  const request = (async () => {
    const comments = [];
    const appendComment = (comment) => {
      const snippet = comment.snippet;
      if (!snippet) return;

      comments.push({
        name: snippet.authorDisplayName || "YouTube user",
        message: snippet.textOriginal || snippet.textDisplay || "",
        date: snippet.publishedAt
          ? new Date(snippet.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
          : "",
        timestamp: Date.parse(snippet.publishedAt || "") || 0,
        source: "YouTube"
      });
    };

    let threadPageToken = "";
    do {
      const threadParams = {
        part: "snippet",
        videoId,
        maxResults: "100",
        order: "time"
      };
      if (threadPageToken) threadParams.pageToken = threadPageToken;

      const threadPage = await fetchYouTubeApi("commentThreads", threadParams);
      for (const thread of threadPage.items || []) {
        const topLevelComment = thread.snippet?.topLevelComment;
        if (!topLevelComment) continue;
        appendComment(topLevelComment);

        if (!thread.snippet.totalReplyCount) continue;
        let replyPageToken = "";
        do {
          const replyParams = {
            part: "snippet",
            parentId: topLevelComment.id,
            maxResults: "100"
          };
          if (replyPageToken) replyParams.pageToken = replyPageToken;

          const replyPage = await fetchYouTubeApi("comments", replyParams);
          (replyPage.items || []).forEach(appendComment);
          replyPageToken = replyPage.nextPageToken || "";
        } while (replyPageToken);
      }
      threadPageToken = threadPage.nextPageToken || "";
    } while (threadPageToken);

    return comments.sort((first, second) => second.timestamp - first.timestamp);
  })();

  youtubeCommentsCache.set(videoId, request);
  try {
    return await request;
  } catch (error) {
    youtubeCommentsCache.delete(videoId);
    throw error;
  }
}

function getLocalComments(videoId = null) {
  try {
    const savedComments = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(savedComments)) return [];

    return savedComments.filter((comment) => {
      if (!comment || !comment.message) return false;
      const savedVideoId = comment.video_id || comment.videoId || comment.trackId;
      return !videoId || !savedVideoId || savedVideoId === videoId;
    }).map((comment) => ({
      name: String(comment.name || "listener"),
      message: String(comment.message),
      date: String(comment.date || "archive comment"),
      source: "archive"
    }));
  } catch (error) {
    console.warn("Could not read locally saved comments.", error);
    return [];
  }
}

function renderComments(comments) {
  commentList.innerHTML = "";

  comments.forEach((comment) => {
    const item = document.createElement("article");
    item.className = "comment";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const author = document.createElement("span");
    author.textContent = comment.name || "listener";
    const source = document.createElement("span");
    source.textContent = [comment.source || "archive", comment.date].filter(Boolean).join(" · ");
    meta.append(author, source);

    const message = document.createElement("p");
    message.textContent = comment.message || comment.text || "";

    item.append(meta, message);
    commentList.append(item);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

async function loadComments(videoId = null) {
  const requestId = ++commentsRequestId;
  if (videoId) {
    commentList.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "form-note";
    loading.textContent = "Loading all public comments...";
    commentList.append(loading);
  }

  const youtubeRequest = videoId
    ? getYouTubeComments(videoId).then((comments) => ({ comments }), (error) => ({ error }))
    : Promise.resolve({ comments: [] });
  const archiveRequest = getComments().then((comments) => ({ comments }), (error) => ({ error }));
  const [youtubeResult, archiveResult] = await Promise.all([youtubeRequest, archiveRequest]);
  if (requestId !== commentsRequestId) return;

  if (youtubeResult.error) console.warn("Could not load YouTube comments.", youtubeResult.error);
  if (archiveResult.error) console.warn("Could not load archive comments.", archiveResult.error);

  const remoteComments = archiveResult.comments || [];
  const matchingArchiveComments = remoteComments.filter((comment) => {
    const commentVideoId = comment.video_id || comment.videoId || comment.trackId;
    return !videoId || !commentVideoId || commentVideoId === videoId;
  }).map((comment) => ({ ...comment, source: "archive" }));
  const comments = [
    ...(youtubeResult.comments || []),
    ...getLocalComments(videoId),
    ...matchingArchiveComments
  ];
  const uniqueComments = Array.from(new Map(
    comments.map((comment) => [`${comment.source || "archive"}\u0000${comment.name || "listener"}\u0000${comment.message || comment.text || ""}\u0000${comment.date || ""}`, comment])
  ).values());
  renderComments(uniqueComments);

  if (!uniqueComments.length || youtubeResult.error || archiveResult.error) {
    const notice = document.createElement("p");
    notice.className = "form-note";
    notice.textContent = !uniqueComments.length && videoId
      ? "No public comments found for this video."
      : !uniqueComments.length
        ? "No archive comments yet."
        : "Some comments could not be loaded.";
    commentList.append(notice);
  }
}

commentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitComment();
});

async function submitComment() {
  if (!currentTrackId) {
    commentForm.querySelector(".form-error")?.remove();
    const notice = document.createElement("p");
    notice.className = "form-note form-error";
    notice.textContent = "Select a track before commenting.";
    commentForm.append(notice);
    return;
  }

  const formData = new FormData(commentForm);
  const comment = {
    video_id: currentTrackId,
    name: String(formData.get("name")).trim(),
    message: String(formData.get("message")).trim(),
    date: new Date().toISOString()
  };

  try {
    const response = await fetch(supabaseCommentsEndpoint, {
      method: "POST",
      headers: { ...supabaseHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(comment)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase responded with status ${response.status}: ${details}`);
    }

    commentForm.reset();
    await loadComments(currentTrackId);
  } catch (error) {
    console.error("Could not save the comment.", error);
    commentForm.querySelector(".form-error")?.remove();
    const notice = document.createElement("p");
    notice.className = "form-note form-error";
    notice.textContent = `Could not save: ${error.message}`;
    commentForm.append(notice);
  }
}

renderTracks();
renderShorts();
loadComments();
renderPlaylists();
renderReleases();
startArchiveRefreshSchedule();

trackSearch.addEventListener("input", (event) => {
  renderTracks(event.target.value, activeTrackYear, activeTrackTheme, activeTrackFormat);
});

trackYearFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter-group='year']");
  if (!button) return;
  renderTracks(trackSearch.value, button.dataset.filterValue, activeTrackTheme, activeTrackFormat);
});

trackThemeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter-group='theme']");
  if (!button) return;
  renderTracks(trackSearch.value, activeTrackYear, button.dataset.filterValue, activeTrackFormat);
});

playerControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-player-action]");
  if (button) movePlayer(button.dataset.playerAction === "next" ? 1 : -1);
});

releaseSearch.addEventListener("input", (event) => {
  renderReleases(event.target.value);
});

document.querySelectorAll(".easter-egg").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.dataset.message || "you found it.";
    const toast = document.createElement("div");
    toast.className = "easter-toast";
    toast.textContent = message;

    const existing = document.querySelector(".easter-toast");
    existing?.remove();

    document.body.append(toast);
    setTimeout(() => toast.remove(), 2400);
  });
});

const headerBrand = document.querySelector(".brand[data-secret='title']");
headerBrand?.addEventListener("click", (event) => {
  event.preventDefault();
  const secretMessages = [
    "segredo: o arquivo sempre esteve vivo.",
    "secret: the archive was never really gone."
  ];
  const message = secretMessages[Math.floor(Math.random() * secretMessages.length)];
  const toast = document.createElement("div");
  toast.className = "easter-toast";
  toast.textContent = message;

  const existing = document.querySelector(".easter-toast");
  existing?.remove();

  document.body.append(toast);
  setTimeout(() => toast.remove(), 2500);
});