/**
 * 時間帯分布・改行統計・共有率・リプライ率の算出。
 */
import type { Tweet } from "@groa/types";

/**
 * 投稿時間帯分布を算出する（24要素配列、各要素はその時間帯の投稿数）。
 */
export function calcHourlyDistribution(timestamps: number[]): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const ts of timestamps) {
    const hour = new Date(ts).getHours();
    hours[hour]++;
  }

  return hours;
}

/** 改行統計 */
export interface LineBreaks {
  tweetsWithBreaks: number;
  avgBreaksPerTweet: number;
}

/**
 * テキスト群の改行統計を算出する。
 */
export function calcLineBreaks(texts: string[]): LineBreaks {
  if (texts.length === 0) {
    return { tweetsWithBreaks: 0, avgBreaksPerTweet: 0 };
  }

  let tweetsWithBreaks = 0;
  let totalBreaks = 0;

  for (const text of texts) {
    const breaks = (text.match(/\n/g) ?? []).length;
    if (breaks > 0) tweetsWithBreaks++;
    totalBreaks += breaks;
  }

  return {
    tweetsWithBreaks,
    avgBreaksPerTweet: round(totalBreaks / texts.length),
  };
}

/** 共有率 */
export interface SharingRate {
  urlRate: number;
  mediaRate: number;
}

/**
 * URL含有率とメディア含有率を算出する。
 */
export function calcSharingRate(tweets: Tweet[]): SharingRate {
  if (tweets.length === 0) {
    return { urlRate: 0, mediaRate: 0 };
  }

  const urlCount = tweets.filter((t) => /\[URL\]/.test(t.text)).length;
  const mediaCount = tweets.filter((t) => t.hasMedia).length;

  return {
    urlRate: round(urlCount / tweets.length),
    mediaRate: round(mediaCount / tweets.length),
  };
}

/**
 * リプライ率を算出する。
 */
export function calcReplyRate(tweets: Tweet[]): number {
  if (tweets.length === 0) return 0;

  const replyCount = tweets.filter((t) => t.replyTo !== null).length;
  return round(replyCount / tweets.length);
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
