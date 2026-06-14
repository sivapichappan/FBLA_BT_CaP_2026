/**
 * API-client unit tests (§16) with fetch fully mocked — no network. The client
 * is the single choke point between the UI and the backend, so what we pin
 * down here is its error CONTRACT: every failure mode (API error body,
 * Pydantic 422 list, timeout, dead network) must surface as an ApiError with
 * a human-readable message — never a raw exception or unparsed JSON.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  authApi,
  photoSrc,
  reviewApi,
  tokenStore,
} from "../api";

/** Build a minimal fetch Response stand-in (only what request() touches). */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  tokenStore.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("photoSrc", () => {
  it("returns null for missing photos (BizImage shows the monogram)", () => {
    expect(photoSrc(null)).toBeNull();
    expect(photoSrc(undefined)).toBeNull();
  });

  it("prefixes backend-proxied relative paths with the API base", () => {
    expect(photoSrc("/businesses/photo?name=abc")).toBe(
      "http://localhost:8000/businesses/photo?name=abc",
    );
  });

  it("passes absolute owner-supplied URLs through untouched", () => {
    expect(photoSrc("https://example.com/p.jpg")).toBe(
      "https://example.com/p.jpg",
    );
  });
});

describe("request happy path", () => {
  it("parses JSON and hits the right URL", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { status: "ok", service: "locallens", online: true }),
    );
    const health = await api.health();
    expect(health.status).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/health");
  });

  it("attaches the bearer token only when one is stored", async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, []));
    await reviewApi.mine();
    let headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    tokenStore.set("jwt-123");
    await reviewApi.mine();
    headers = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-123");
  });
});

describe("error contract", () => {
  it("surfaces the backend's {error} message with the HTTP status", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(401, { error: "Invalid email or password." }),
    );
    const err = await authApi.login("a@b.c", "wrong").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Invalid email or password.");
    expect(err.status).toBe(401);
  });

  it("surfaces FastAPI's {detail: string} shape", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(404, { detail: "Not Found" }));
    const err = await api.health().catch((e) => e);
    expect(err.message).toBe("Not Found");
  });

  it("flattens a Pydantic 422 list to 'field: message'", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(422, {
        detail: [
          {
            loc: ["body", "rating"],
            msg: "Input should be less than or equal to 5",
          },
        ],
      }),
    );
    const err = await api.health().catch((e) => e);
    expect(err.message).toBe("rating: Input should be less than or equal to 5");
    expect(err.status).toBe(422);
  });

  it("falls back to a generic message when the error body is empty", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(500, {}));
    const err = await api.health().catch((e) => e);
    expect(err.message).toBe("Request failed (500)");
  });

  it("turns a request timeout into a friendly retry message", async () => {
    // AbortSignal.timeout aborts with a DOMException named "TimeoutError".
    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation timed out.", "TimeoutError"),
    );
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("That took too long — please try again.");
    expect(err.status).toBe(0);
  });

  it("turns a dead network into a friendly connection message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await api.health().catch((e) => e);
    expect(err.message).toBe("Can't reach the server. Check your connection.");
    expect(err.status).toBe(0);
  });
});

describe("tokenStore", () => {
  it("round-trips through localStorage and clears cleanly", () => {
    expect(tokenStore.get()).toBeNull();
    tokenStore.set("abc");
    expect(tokenStore.get()).toBe("abc");
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });
});
