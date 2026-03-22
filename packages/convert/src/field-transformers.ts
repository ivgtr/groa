import { TweetId, Timestamp } from "@groa/types";
import { ConversionError } from "./errors.js";

// --- TweetId 変換 ---

/**
 * 任意の値を TweetId に変換する。数値・文字列を受け付ける。
 *
 * 注意: JavaScript の Number 型は 2^53-1 (Number.MAX_SAFE_INTEGER) を超える
 * 整数を正確に表現できない。ツイートIDが数値として格納されている場合、
 * JSON.parse の時点で既に精度が失われている可能性がある。
 * 精度が必要な場合は、元データでIDを文字列として保持することを推奨する。
 */
export function toTweetId(value: unknown): TweetId {
  if (typeof value === "string" && value.length > 0) {
    return TweetId(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return TweetId(String(value));
  }
  throw new ConversionError("id", value, `TweetId に変換できません: ${String(value)}`);
}

// --- Timestamp 変換 ---

/**
 * タイムゾーン略語 → UTC オフセット（分）のマッピング。
 * 対応できるだけ対応する方針のため、主要なタイムゾーンを網羅する。
 */
/**
 * 曖昧なタイムゾーン略語（CST, IST等）は複数の地域で使われるため除外している。
 * これらが入力に含まれる場合は ConversionError で明示的にエラーとし、
 * ユーザーに数値オフセット付き形式（ISO 8601等）の使用を促す。
 */
const TIMEZONE_OFFSETS: Record<string, number> = {
  // アジア・オセアニア
  JST: 9 * 60,
  KST: 9 * 60,
  HKT: 8 * 60,
  SGT: 8 * 60,
  ICT: 7 * 60,
  MSK: 3 * 60,
  NZST: 12 * 60,
  NZDT: 13 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60,
  ACST: 9 * 60 + 30,
  AWST: 8 * 60,
  // ヨーロッパ
  EET: 2 * 60,
  CET: 1 * 60,
  GMT: 0,
  UTC: 0,
  WET: 0,
  // アメリカ
  EST: -5 * 60,
  EDT: -4 * 60,
  CDT: -5 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  PST: -8 * 60,
  PDT: -7 * 60,
  HST: -10 * 60,
  AKST: -9 * 60,
  AKDT: -8 * 60,
};

/**
 * "YYYY-MM-DD HH:MM:SS TZ" 形式をパースする。
 * 例: "2020-10-21 23:00:23 JST"
 */
const DATETIME_WITH_TZ_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([A-Z]{2,4})$/;

/**
 * "YYYY-MM-DD HH:MM:SS" 形式（タイムゾーンなし、UTCとして扱う）。
 */
const DATETIME_NO_TZ_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;

/**
 * RFC 2822 風の日時文字列をパースする。
 * 例: "Thu Oct 21 23:00:23 +0000 2020" (Twitter公式エクスポート形式)
 */
const RFC2822_REGEX =
  /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/;

const MONTH_NAMES: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Unix epoch の秒/ミリ秒判定閾値。2001-09-09 以降の ms は 1e12 を超える。 */
const MS_THRESHOLD = 1e12;

/**
 * 任意の値を Timestamp（Unix epoch ミリ秒）に変換する。
 *
 * 対応形式:
 * 1. number: 秒/ミリ秒を桁数で自動判定
 * 2. "YYYY-MM-DD HH:MM:SS TZ": タイムゾーン略語付き
 * 3. "YYYY-MM-DD HH:MM:SS": タイムゾーンなし（UTCとして扱う）
 * 4. "Thu Oct 21 23:00:23 +0000 2020": RFC 2822風（Twitter公式）
 * 5. ISO 8601 文字列: Date.parse() でパース
 */
export function toTimestamp(value: unknown): Timestamp {
  // 数値
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < MS_THRESHOLD ? value * 1000 : value;
    return Timestamp(Math.round(ms));
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new ConversionError(
      "timestamp",
      value,
      `Timestamp に変換できません: ${String(value)}`,
    );
  }

  const str = value.trim();

  // "YYYY-MM-DD HH:MM:SS TZ" 形式
  const tzMatch = DATETIME_WITH_TZ_REGEX.exec(str);
  if (tzMatch) {
    const [, y, mo, d, h, mi, s, tz] = tzMatch;
    const offsetMin = TIMEZONE_OFFSETS[tz];
    if (offsetMin === undefined) {
      throw new ConversionError(
        "timestamp",
        value,
        `未対応のタイムゾーン: ${tz}`,
      );
    }
    const utcMs = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    );
    return Timestamp(utcMs - offsetMin * 60 * 1000);
  }

  // "YYYY-MM-DD HH:MM:SS" 形式（UTC）
  const noTzMatch = DATETIME_NO_TZ_REGEX.exec(str);
  if (noTzMatch) {
    const [, y, mo, d, h, mi, s] = noTzMatch;
    const utcMs = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    );
    return Timestamp(utcMs);
  }

  // RFC 2822風（"Thu Oct 21 23:00:23 +0000 2020"）
  const rfcMatch = RFC2822_REGEX.exec(str);
  if (rfcMatch) {
    const [, monthStr, day, h, mi, s, offset, year] = rfcMatch;
    const month = MONTH_NAMES[monthStr];
    if (month === undefined) {
      throw new ConversionError("timestamp", value, `不正な月名: ${monthStr}`);
    }
    const sign = offset[0] === "-" ? -1 : 1;
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(3, 5));
    const totalOffsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
    const utcMs = Date.UTC(
      Number(year),
      month,
      Number(day),
      Number(h),
      Number(mi),
      Number(s),
    );
    return Timestamp(utcMs - totalOffsetMs);
  }

  // ISO 8601 フォールバック
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    return Timestamp(parsed);
  }

  throw new ConversionError(
    "timestamp",
    value,
    `Timestamp に変換できません: ${str}`,
  );
}

// --- Boolean 変換 ---

/** 任意の値を boolean に変換する。boolean, 数値(0/1), 文字列("true"/"false") を受け付ける。 */
export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0" || lower === "") return false;
  }
  return Boolean(value);
}

// --- HasMedia 変換 ---

/** 配列が非空、または truthy な値を hasMedia として判定する。 */
export function toHasMedia(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0 && value !== "0" && value !== "false";
  return false;
}

// --- ReplyTo 変換 ---

/** 値を TweetId | null に変換する。空文字・null・undefined は null として扱う。 */
export function toNullableTweetId(value: unknown): TweetId | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    if (value === "" || value === "null" || value === "0") return null;
    return TweetId(value);
  }
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return TweetId(String(value));
  }
  return null;
}

// --- Text 変換 ---

/** 値を文字列に変換する。空文字はエラー。 */
export function toText(value: unknown): string {
  if (typeof value === "string") {
    if (value.length === 0) {
      throw new ConversionError("text", value, "テキストが空です");
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new ConversionError("text", value, `テキストに変換できません: ${String(value)}`);
}
