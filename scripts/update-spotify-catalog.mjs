import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultArtistId = "7pxIYxdkx2675ZGKSAPBAy";

function base64(value) {
  return Buffer.from(value).toString("base64");
}

export async function getSpotifyToken(clientId, clientSecret, fetchImpl = fetch) {
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required. Add both to GitHub Actions secrets and rerun the workflow.");
  }

  const response = await fetchImpl("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token request failed with HTTP ${response.status}: ${text}`);
  }

  const tokenPayload = await response.json();
  return tokenPayload.access_token;
}

export async function fetchSpotifyCatalog({ artistId = defaultArtistId, clientId, clientSecret, fetchImpl = fetch }) {
  const token = await getSpotifyToken(clientId, clientSecret, fetchImpl);
  const limit = 50;
  const albums = [];
  let nextUrl = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=${limit}`;

  while (nextUrl) {
    const response = await fetchImpl(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify catalog request failed with HTTP ${response.status}: ${text}`);
    }

    const payload = await response.json();
    payload.items?.forEach((album) => {
      albums.push({
        id: album.id,
        name: album.name,
        type: album.album_type,
        releaseDate: album.release_date,
        totalTracks: album.total_tracks,
        image: album.images?.[0]?.url || "",
        url: album.external_urls?.spotify || ""
      });
    });

    nextUrl = payload.next || "";
  }

  return albums;
}

export function renderSpotifyCatalog(catalog) {
  return `window.mhieSpotifyCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
}

async function main() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const artistId = process.env.SPOTIFY_ARTIST_ID || defaultArtistId;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET. Add both in the repository secrets before running the workflow.");
  }

  const catalog = await fetchSpotifyCatalog({ artistId, clientId, clientSecret });
  const outputPath = resolve(fileURLToPath(new URL("../spotify-data.js", import.meta.url)));
  await writeFile(outputPath, renderSpotifyCatalog(catalog));
  console.log(`Updated Spotify catalog with ${catalog.length} releases.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
