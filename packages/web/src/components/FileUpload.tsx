import { useCallback, useRef, useState } from "react";
import { useAppStore } from "../store.ts";
import { detectFormat, parseTweetsJs } from "@groa/convert";

const MIN_TWEETS = 10;
const MAX_TWEETS = 50000;
const WARN_THRESHOLD = 100;

/**
 * パースされた配列を検証し、フォーマット検出を行う共通ロジック。
 * groa ネイティブ形式ならそのまま setTweets、それ以外なら setRawData でマッピング画面へ。
 */
function processJsonArray(
  parsed: unknown[],
  setTweets: (tweets: unknown[], count: number) => void,
  setRawData: (data: unknown[], detected: ReturnType<typeof detectFormat>) => void,
  setUploadError: (error: string | null) => void,
): void {
  if (parsed.length < MIN_TWEETS) {
    setUploadError(
      `データ件数が少なすぎます（${String(parsed.length)}件）。最低${String(MIN_TWEETS)}件必要です。`,
    );
    return;
  }
  if (parsed.length > MAX_TWEETS) {
    setUploadError(
      `データ件数が多すぎます（${String(parsed.length)}件）。最大${String(MAX_TWEETS)}件まで対応しています。`,
    );
    return;
  }

  const detected = detectFormat(parsed);

  if (detected.isNativeGroa) {
    setTweets(parsed, parsed.length);
  } else {
    setRawData(parsed, detected);
  }
}

export function FileUpload() {
  const { setTweets, setRawData, setUploadError, uploadError } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      const isJs = file.name.endsWith(".js");
      const isJson = file.name.endsWith(".json");
      if (!isJson && !isJs) {
        setUploadError("対応形式: .json または .js（Twitter/X エクスポート）");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          let parsed: unknown;
          if (isJs) {
            parsed = parseTweetsJs(reader.result as string);
          } else {
            parsed = JSON.parse(reader.result as string);
          }
          if (!Array.isArray(parsed)) {
            setUploadError("ファイルの内容が配列ではありません。ツイートデータの配列を含むファイルを選択してください。");
            return;
          }
          processJsonArray(parsed, setTweets, setRawData, setUploadError);
        } catch (error) {
          setUploadError(
            error instanceof Error ? error.message : "ファイルの解析に失敗しました。",
          );
        }
      };
      reader.onerror = () => {
        setUploadError("ファイルの読み込みに失敗しました。");
      };
      reader.readAsText(file);
    },
    [setTweets, setRawData, setUploadError],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 cursor-pointer transition-colors ${
          isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <svg
          className={`mb-4 h-12 w-12 ${isDragOver ? "text-blue-500" : "text-gray-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          ツイートデータのファイルをドラッグ＆ドロップ
        </p>
        <p className="mt-1 text-xs text-gray-500">または</p>
        <span className="mt-2 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          ファイルを選択
        </span>
        <p className="mt-3 text-xs text-gray-400">
          対応形式: .json / .js（Twitter/X エクスポート）（{String(MIN_TWEETS)}〜{String(MAX_TWEETS)}件）
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.js"
        onChange={handleFileSelect}
        className="hidden"
      />

      <UrlImport />

      {uploadError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <p className="text-sm text-red-700">{uploadError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function UrlImport() {
  const { setTweets, setRawData, setUploadError } = useAppStore();
  const [urlInput, setUrlInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFetch = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    if (!/^https?:\/\//i.test(trimmed)) {
      setUploadError("URLは http:// または https:// で始まる必要があります。");
      return;
    }

    setIsLoading(true);
    setUploadError(null);

    try {
      const response = await fetch(trimmed);
      if (!response.ok) {
        setUploadError(`URLの読み込みに失敗しました（HTTP ${String(response.status)}）`);
        return;
      }
      const text = await response.text();
      const parsed: unknown = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        setUploadError("JSONの内容が配列ではありません。ツイートデータの配列を含むJSONを指定してください。");
        return;
      }

      processJsonArray(parsed, setTweets, setRawData, setUploadError);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setUploadError("URLから取得したデータのJSON解析に失敗しました。");
      } else if (error instanceof TypeError) {
        setUploadError(
          "このURLはブラウザのCORS制限により直接読み込めません。JSONファイルをダウンロードしてからファイルアップロードをご利用ください。",
        );
      } else {
        setUploadError("URLからのデータ取得に失敗しました。");
      }
    } finally {
      setIsLoading(false);
    }
  }, [urlInput, setTweets, setRawData, setUploadError]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">またはURLから読み込み</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleFetch(); }}
          placeholder="https://example.com/tweets.json"
          disabled={isLoading}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleFetch()}
          disabled={isLoading || !urlInput.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          読み込み
        </button>
      </div>
    </div>
  );
}

export function FileUploadResult() {
  const { tweetCount, clearTweets } = useAppStore();

  return (
    <div className="rounded-md border border-green-300 bg-green-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-800">
              ファイルを読み込みました
            </p>
            <p className="text-sm text-green-700">
              ツイート数: {tweetCount.toLocaleString()}件
            </p>
            {tweetCount < WARN_THRESHOLD && (
              <p className="mt-1 text-xs text-amber-600">
                ツイート数が{String(WARN_THRESHOLD)}件未満のため、分析精度が低下する可能性があります。
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={clearTweets}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          クリア
        </button>
      </div>
    </div>
  );
}
