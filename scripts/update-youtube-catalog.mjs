import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const YOUTUBE_CHANNEL_ID = "UCADJhczGwtPelGm0EqVi3Mg";

async function requestYouTube(resource, params, apiKey, fetchImpl) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error(`Failed to request the YouTube ${resource} resource.`);
  }

  if (!response.ok) {
    throw new Error(`YouTube ${resource} request failed with HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`YouTube returned invalid JSON for ${resource}.`);
  }
}

export async function fetchChannelUploads(apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error("The YOUTUBE_API_KEY secret is required.");

  const channel = await requestYouTube("channels", {
    part: "contentDetails",
    id: YOUTUBE_CHANNEL_ID
  }, apiKey, fetchImpl);
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

    const page = await requestYouTube("playlistItems", params, apiKey, fetchImpl);
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

export function renderMusicData(uploads) {
  return `window.mhieMusicData = ${JSON.stringify(uploads, null, 2)};\n`;
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const uploads = await fetchChannelUploads(apiKey);
  const musicDataPath = resolve(fileURLToPath(new URL("../music-data.js", import.meta.url)));
  await writeFile(musicDataPath, renderMusicData(uploads));
  console.log(`Updated the catalog with ${uploads.length} videos.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
