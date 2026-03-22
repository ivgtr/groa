import { describe, it, expect, vi, afterEach } from "vitest";
import { isUrl, fetchJsonFromUrl, readJsonSource } from "./validate.js";

describe("isUrl", () => {
  it("http:// で始まる文字列は true", () => {
    expect(isUrl("http://example.com/data.json")).toBe(true);
  });

  it("https:// で始まる文字列は true", () => {
    expect(isUrl("https://example.com/data.json")).toBe(true);
  });

  it("大文字でも true", () => {
    expect(isUrl("HTTPS://EXAMPLE.COM/data.json")).toBe(true);
  });

  it("ローカルファイルパスは false", () => {
    expect(isUrl("./local/file.json")).toBe(false);
    expect(isUrl("/absolute/path.json")).toBe(false);
    expect(isUrl("relative.json")).toBe(false);
  });

  it("ftp:// は false", () => {
    expect(isUrl("ftp://server.com/data.json")).toBe(false);
  });
});

describe("fetchJsonFromUrl", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("正常なJSONレスポンスをパースして返す", async () => {
    const data = [{ id: "1", text: "hello" }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(data)),
    });

    const result = await fetchJsonFromUrl("https://example.com/tweets.json", "テスト");
    expect(result).toEqual(data);
  });

  it("HTTPエラー時にステータスコード付きエラーをスロー", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(
      fetchJsonFromUrl("https://example.com/not-found.json", "テスト"),
    ).rejects.toThrow("HTTPエラー (404)");
  });

  it("ネットワークエラー時に接続失敗エラーをスロー", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchJsonFromUrl("https://unreachable.example.com/data.json", "テスト"),
    ).rejects.toThrow("URLへの接続に失敗しました");
  });

  it("不正なJSONレスポンス時にパースエラーをスロー", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve("not json content"),
    });

    await expect(
      fetchJsonFromUrl("https://example.com/bad.json", "テスト"),
    ).rejects.toThrow("JSON形式が不正です");
  });

  it("タイムアウト時にタイムアウトエラーをスロー", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    await expect(
      fetchJsonFromUrl("https://slow.example.com/data.json", "テスト"),
    ).rejects.toThrow("タイムアウト");
  });
});

describe("readJsonSource", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("URLの場合はfetchで取得する", async () => {
    const data = [{ id: "1", text: "test" }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(data)),
    });

    const result = await readJsonSource("https://example.com/tweets.json", "テスト");
    expect(result).toEqual(data);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("ファイルパスの場合はreadJsonFileと同じエラーをスロー", async () => {
    await expect(
      readJsonSource("/nonexistent/file.json", "テスト"),
    ).rejects.toThrow("ファイルが見つかりません");
  });
});
