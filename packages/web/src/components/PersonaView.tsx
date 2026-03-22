import { useCallback, useEffect, useState } from "react";
import type { PersonaDocument, StyleStats, AttitudePattern } from "@groa/types";
import { useAppStore } from "../store.ts";
import {
  loadPersonaDocument,
  loadStepResult,
} from "../storage/storage.ts";
import { PersonaBody } from "./persona/PersonaBody.tsx";
import { VoiceBankSection } from "./persona/VoiceBankSection.tsx";
import { StyleStatsSection } from "./persona/StyleStatsSection.tsx";
import { MOCK_PERSONA, MOCK_STYLE_STATS } from "./persona/mock-data.ts";

const CATEGORY_LABELS: Record<string, string> = {
  tech: "技術",
  daily: "日常",
  opinion: "意見",
  emotion: "感情",
  creative: "創作",
  other: "その他",
};

function AttitudePatternsSection({
  patterns,
}: {
  patterns: AttitudePattern[];
}) {
  return (
    <section>
      <details open>
        <summary className="text-lg font-semibold text-gray-900 mb-4 cursor-pointer select-none">
          態度パターン ({patterns.length}件)
        </summary>
        <div className="space-y-3 mt-4">
          {patterns.map((pattern, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-4"
            >
              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                {pattern.name}
              </h4>
              <p className="text-sm text-gray-700 mb-3 leading-relaxed">
                {pattern.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {pattern.sourceCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </span>
                ))}
                {pattern.exampleTweetIds.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs text-gray-500">
                    参照ツイート: {pattern.exampleTweetIds.length}件
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function ContradictionsSection({
  contradictions,
}: {
  contradictions: string[];
}) {
  if (contradictions.length === 0) return null;

  return (
    <section>
      <details open>
        <summary className="text-lg font-semibold text-gray-900 mb-4 cursor-pointer select-none">
          矛盾の記録 ({contradictions.length}件)
        </summary>
        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
          <ul className="space-y-2">
            {contradictions.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="shrink-0 text-amber-500 mt-0.5">&#9888;</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

function SourceMetadataSection({
  sourceStats,
}: {
  sourceStats: PersonaDocument["sourceStats"];
}) {
  const startDate = new Date(sourceStats.dateRange.start);
  const endDate = new Date(sourceStats.dateRange.end);
  const formatDate = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">ソース情報</h2>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-500 mb-1">総ツイート数</p>
            <p className="text-xl font-semibold text-gray-900">
              {sourceStats.totalCount.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 mb-1">フィルタ後</p>
            <p className="text-xl font-semibold text-gray-900">
              {sourceStats.filteredCount.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 mb-1">期間</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatDate(startDate)} - {formatDate(endDate)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PersonaView() {
  const setView = useAppStore((s) => s.setView);

  const [persona, setPersona] = useState<PersonaDocument | null>(null);
  const [styleStats, setStyleStats] = useState<StyleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [doc, stats] = await Promise.all([
          loadPersonaDocument(),
          loadStepResult("stats"),
        ]);
        if (cancelled) return;
        if (doc) {
          setPersona(doc as PersonaDocument);
        }
        if (stats) {
          setStyleStats(stats as StyleStats);
        }
        if (!doc) {
          setUseMock(true);
          setPersona(MOCK_PERSONA);
          setStyleStats(MOCK_STYLE_STATS);
        }
      } catch {
        if (cancelled) return;
        setUseMock(true);
        setPersona(MOCK_PERSONA);
        setStyleStats(MOCK_STYLE_STATS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoToGenerate = useCallback(() => {
    setView("generate");
  }, [setView]);

  const handleBack = useCallback(() => {
    setView("building");
  }, [setView]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="space-y-4">
        <p className="text-gray-600">
          ペルソナデータがありません。ビルドを実行してください。
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {useMock && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            保存されたペルソナデータが見つからないため、サンプルデータを表示しています。
          </p>
        </div>
      )}

      <PersonaBody body={persona.body} />
      <VoiceBankSection entries={persona.voiceBank} />
      <AttitudePatternsSection patterns={persona.attitudePatterns} />
      <ContradictionsSection contradictions={persona.contradictions} />

      {styleStats && <StyleStatsSection stats={styleStats} />}

      <SourceMetadataSection sourceStats={persona.sourceStats} />

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={handleGoToGenerate}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          テキスト生成へ
        </button>
      </div>
    </div>
  );
}
