import { describe, it, expect } from "vitest";
import { validateBuildName } from "./build-name.js";

describe("validateBuildName", () => {
  it("英数字の名前を受け入れる", () => {
    expect(validateBuildName("alice")).toBe("alice");
    expect(validateBuildName("Alice123")).toBe("Alice123");
  });

  it("ハイフン・アンダースコアを受け入れる", () => {
    expect(validateBuildName("my-build")).toBe("my-build");
    expect(validateBuildName("my_build")).toBe("my_build");
    expect(validateBuildName("test-build_v2")).toBe("test-build_v2");
  });

  it("スラッシュを拒否する", () => {
    expect(() => validateBuildName("a/b")).toThrow("無効なビルド名");
    expect(() => validateBuildName("../foo")).toThrow("無効なビルド名");
  });

  it("ドットを拒否する", () => {
    expect(() => validateBuildName("a.b")).toThrow("無効なビルド名");
    expect(() => validateBuildName("..")).toThrow("無効なビルド名");
  });

  it("スペースを拒否する", () => {
    expect(() => validateBuildName("a b")).toThrow("無効なビルド名");
  });

  it("日本語を拒否する", () => {
    expect(() => validateBuildName("テスト")).toThrow("無効なビルド名");
  });

  it("空文字を拒否する", () => {
    expect(() => validateBuildName("")).toThrow("無効なビルド名");
  });
});
