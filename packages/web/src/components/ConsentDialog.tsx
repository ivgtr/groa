import { useState } from "react";
import { useAppStore } from "../store.ts";

export function ConsentDialog() {
  const { setConsented } = useAppStore();
  const [checked, setChecked] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="p-6 space-y-4">
          <h2
            id="consent-title"
            className="text-lg font-bold text-gray-900"
          >
            データ送信についての確認
          </h2>

          <div className="space-y-3 text-sm text-gray-700">
            <p>
              groaはツイートデータをAnthropicのLLM APIに送信して分析を行います。
            </p>

            <dl className="space-y-2">
              <div>
                <dt className="font-medium text-gray-900">送信されるデータ</dt>
                <dd className="ml-4">ツイートのテキスト内容</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-900">送信先</dt>
                <dd className="ml-4">Anthropic Messages API</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-900">目的</dt>
                <dd className="ml-4">
                  テキスト分類、クラスタ分析、ペルソナ合成、テキスト生成、品質評価
                </dd>
              </div>
            </dl>

            <p className="text-gray-500">
              Anthropicのデータ取り扱いポリシーが適用されます。
            </p>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              上記の内容を理解し、データの送信に同意します
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={() => setConsented(false)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => setConsented(true)}
            disabled={!checked}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            同意して開始
          </button>
        </div>
      </div>
    </div>
  );
}
