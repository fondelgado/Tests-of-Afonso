import assert from "node:assert/strict";
import test from "node:test";
import { fetchSpotifyCatalog, getSpotifyToken, renderSpotifyCatalog } from "./update-spotify-catalog.mjs";

const makeFetch = (tokenResponse, albumResponses) => async (input, init) => {
  if (typeof input === "string" && input === "https://accounts.spotify.com/api/token") {
    return new Response(JSON.stringify(tokenResponse), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (typeof input === "string" && input.startsWith("https://api.spotify.com/v1/artists/")) {
    const data = albumResponses.shift();
    if (!data) {
      return new Response(JSON.stringify({ items: [], next: null }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (input instanceof URL) {
    return new Response(JSON.stringify({ items: [], next: null }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("ok", { status: 200 });
};

test("fetches spotify token and catalog items", async () => {
  const catalog = await fetchSpotifyCatalog({
    artistId: "artist-1",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl: makeFetch(
      { access_token: "spotify-token" },
      [{
        items: [{
          id: "album-1",
          name: "The Album",
          album_type: "album",
          release_date: "2024-01-01",
          total_tracks: 12,
          images: [{ url: "https://example.com/cover.jpg" }],
          external_urls: { spotify: "https://open.spotify.com/album/album-1" }
        }],
        next: null
      }]
    )
  });

  assert.equal(catalog[0].name, "The Album");
  assert.equal(catalog[0].url, "https://open.spotify.com/album/album-1");
  assert.match(renderSpotifyCatalog(catalog), /window\.mhieSpotifyCatalog = \[/);
});

test("rejects missing spotify credentials", async () => {
  await assert.rejects(() => getSpotifyToken("", ""), {
    message: "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required."
  });
});
