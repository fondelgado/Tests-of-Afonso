import assert from "node:assert/strict";
import test from "node:test";
import { fetchChannelUploads, renderMusicData } from "./update-youtube-catalog.mjs";

test("fetches every page of the channel uploads playlist", async () => {
  const requestedUrls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requestedUrls.push(url);

    if (url.pathname.endsWith("/channels")) {
      return Response.json({
        items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-id" } } }]
      });
    }

    if (!url.searchParams.has("pageToken")) {
      return Response.json({
        items: [{
          snippet: {
            resourceId: { videoId: "video-1" },
            title: "First video",
            publishedAt: "2026-10-25T10:00:00Z"
          }
        }],
        nextPageToken: "next-page"
      });
    }

    return Response.json({
      items: [{
        snippet: {
          resourceId: { videoId: "video-2" },
          title: "Second video",
          publishedAt: "2026-10-26T10:00:00Z"
        }
      }]
    });
  };

  const uploads = await fetchChannelUploads("test-api-key", fetchImpl);

  assert.deepEqual(uploads.map(({ id }) => id), ["video-1", "video-2"]);
  assert.equal(uploads[0].publishedAt, "2026-10-25T10:00:00Z");
  assert.equal(requestedUrls.length, 3);
  assert.ok(requestedUrls.every((url) => url.searchParams.get("key") === "test-api-key"));
  assert.match(renderMusicData(uploads), /window\.mhieMusicData = \[/);
});

test("fails explicitly when the API key is missing", async () => {
  await assert.rejects(() => fetchChannelUploads(""), {
    message: "The YOUTUBE_API_KEY secret is required."
  });
});

test("reports API failures without exposing the key", async () => {
  const apiKey = "test-api-key";

  await assert.rejects(
    () => fetchChannelUploads(apiKey, async () => new Response("forbidden", { status: 403 })),
    (error) => {
      assert.equal(error.message, "YouTube channels request failed with HTTP 403.");
      assert.equal(error.message.includes(apiKey), false);
      return true;
    }
  );
});
