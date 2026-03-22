import { useState } from "react";
import { useAppStore } from "../store.ts";

export function ApiKeyForm() {
  const { apiKey, setApiKey } = useAppStore();
  const [inputValue, setInputValue] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      setApiKey(trimmed);
      setInputValue("");
      setShowKey(false);
    }
  };

  const handleClear = () => {
    setApiKey(null);
    setInputValue("");
    setShowKey(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">APIキー設定</h2>

      {/* Key status */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${apiKey ? "bg-green-500" : "bg-gray-400"}`}
        />
        <span className="text-sm text-gray-700">
          {apiKey ? "APIキーが設定されています" : "APIキーが未設定です"}
        </span>
      </div>

      {/* Input form */}
      {!apiKey && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-ant-..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-16 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
            >
              {showKey ? "隠す" : "表示"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!inputValue.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      )}

      {/* Clear button */}
      {apiKey && (
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          APIキーをクリア
        </button>
      )}

      {/* CORS warning */}
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 text-lg leading-none" aria-hidden="true">!</span>
          <h3 className="text-sm font-semibold text-amber-800">
            CORS・セキュリティに関する注意
          </h3>
        </div>
        <ul className="ml-5 list-disc space-y-1 text-sm text-amber-700">
          <li>
            ブラウザからAnthropicのAPIを直接呼び出すために、
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              anthropic-dangerous-direct-browser-access: true
            </code>
            {" "}ヘッダが使用されます。
          </li>
          <li>
            このヘッダはAPIキーがブラウザに直接公開されることを意味します。
          </li>
          <li>
            信頼できるネットワーク上でのみ使用し、APIキーの使用上限を設定することを推奨します。
          </li>
        </ul>
      </div>

      {/* Backend note */}
      <div className="rounded-md border border-gray-200 bg-gray-100 p-4 space-y-1">
        <p className="text-sm text-gray-600">
          claude-code バックエンドはブラウザでは利用できません。APIバックエンドのみ使用可能です。
        </p>
        <p className="text-sm text-gray-600">
          APIキーはブラウザのメモリにのみ保持され、ページをリロードすると消失します。
        </p>
      </div>
    </section>
  );
}
