import { useCallback, useRef, useState } from "react";
import { useAppStore } from "../store.ts";

const MIN_TWEETS = 10;
const MAX_TWEETS = 50000;
const WARN_THRESHOLD = 100;

export function FileUpload() {
  const { setTweets, setUploadError, uploadError } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        setUploadError("JSONファイル（.json）のみ対応しています。");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed: unknown = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            setUploadError("JSONファイルの内容が配列ではありません。ツイートデータの配列を含むJSONファイルを選択してください。");
            return;
          }
          if (parsed.length < MIN_TWEETS) {
            setUploadError(
              `ツイート数が少なすぎます（${String(parsed.length)}件）。最低${String(MIN_TWEETS)}件のツイートが必要です。`,
            );
            return;
          }
          if (parsed.length > MAX_TWEETS) {
            setUploadError(
              `ツイート数が多すぎます（${String(parsed.length)}件）。最大${String(MAX_TWEETS)}件まで対応しています。`,
            );
            return;
          }
          setTweets(parsed, parsed.length);
        } catch {
          setUploadError("JSONファイルの解析に失敗しました。有効なJSONファイルを選択してください。");
        }
      };
      reader.onerror = () => {
        setUploadError("ファイルの読み込みに失敗しました。");
      };
      reader.readAsText(file);
    },
    [setTweets, setUploadError],
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
          ツイートデータのJSONファイルをドラッグ＆ドロップ
        </p>
        <p className="mt-1 text-xs text-gray-500">または</p>
        <span className="mt-2 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          ファイルを選択
        </span>
        <p className="mt-3 text-xs text-gray-400">
          対応形式: .json（{String(MIN_TWEETS)}〜{String(MAX_TWEETS)}件のツイート配列）
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

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
