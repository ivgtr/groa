import { create } from "zustand";
import type { DetectFormatResult } from "@groa/convert";

export interface BuildStep {
  name: string;
  status: "pending" | "running" | "done" | "error";
  costUsd: number;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

export interface GenerationResult {
  text: string;
  topic: string;
  evaluation: {
    authenticity: number;
    coherence: number;
    consistency: number;
    rationale: string;
  } | null;
  fewShotIds: string[];
  modelUsed: string;
}

export interface AppState {
  /** 現在のビュー */
  view: "upload" | "mapping" | "building" | "persona" | "generate";
  /** ビューを切り替える */
  setView: (view: AppState["view"]) => void;

  /** APIキー（メモリのみ、IndexedDBには保存しない） */
  apiKey: string | null;
  /** APIキーを設定する */
  setApiKey: (key: string | null) => void;

  /** データ送信同意（セッション中のみ有効、リロードで消失） */
  hasConsented: boolean;
  /** 同意状態を設定する */
  setConsented: (consented: boolean) => void;

  /** アップロードされたツイートデータ */
  tweets: unknown[] | null;
  /** ツイート件数 */
  tweetCount: number;
  /** アップロードエラー */
  uploadError: string | null;
  /** ツイートデータを設定する */
  setTweets: (tweets: unknown[], count: number) => void;
  /** アップロードエラーを設定する */
  setUploadError: (error: string | null) => void;
  /** ツイートデータをクリアする */
  clearTweets: () => void;

  /** 変換前の生データ（マッピング確定後に破棄） */
  rawData: unknown[] | null;
  /** フォーマット検出結果 */
  detectedFormat: DetectFormatResult | null;
  /** 生データを設定し mapping ビューに遷移する */
  setRawData: (data: unknown[], detected: DetectFormatResult) => void;
  /** 生データをクリアする */
  clearRawData: () => void;

  /** ビルドステップ一覧 */
  buildSteps: BuildStep[];
  /** ビルドエラー */
  buildError: string | null;
  /** 合計コスト（USD） */
  totalCostUsd: number;
  /** ビルド実行中フラグ */
  isBuilding: boolean;
  /** ビルドステップを初期化する */
  setBuildSteps: (steps: BuildStep[]) => void;
  /** 個別のビルドステップを更新する */
  updateBuildStep: (name: string, update: Partial<BuildStep>) => void;
  /** ビルドエラーを設定する */
  setBuildError: (error: string | null) => void;
  /** 合計コストを設定する */
  setTotalCostUsd: (cost: number) => void;
  /** ビルド実行中フラグを設定する */
  setIsBuilding: (building: boolean) => void;

  /** 生成結果 */
  generationResults: GenerationResult[];
  /** 生成中フラグ */
  isGenerating: boolean;
  /** 生成エラー */
  generateError: string | null;
  /** 生成結果を設定する */
  setGenerationResults: (results: GenerationResult[]) => void;
  /** 生成中フラグを設定する */
  setIsGenerating: (generating: boolean) => void;
  /** 生成エラーを設定する */
  setGenerateError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "upload",
  setView: (view) => set({ view }),

  apiKey: null,
  setApiKey: (apiKey) => set({ apiKey }),

  hasConsented: false,
  setConsented: (hasConsented) => set({ hasConsented }),

  tweets: null,
  tweetCount: 0,
  uploadError: null,
  setTweets: (tweets, count) =>
    set({ tweets, tweetCount: count, uploadError: null, rawData: null, detectedFormat: null, view: "upload" }),
  setUploadError: (uploadError) => set({ uploadError }),
  clearTweets: () => set({ tweets: null, tweetCount: 0, uploadError: null }),

  rawData: null,
  detectedFormat: null,
  setRawData: (rawData, detectedFormat) =>
    set({ rawData, detectedFormat, view: "mapping", uploadError: null }),
  clearRawData: () => set({ rawData: null, detectedFormat: null, view: "upload" }),

  buildSteps: [],
  buildError: null,
  totalCostUsd: 0,
  isBuilding: false,
  setBuildSteps: (buildSteps) => set({ buildSteps }),
  updateBuildStep: (name, update) =>
    set((state) => ({
      buildSteps: state.buildSteps.map((step) =>
        step.name === name ? { ...step, ...update } : step,
      ),
    })),
  setBuildError: (buildError) => set({ buildError }),
  setTotalCostUsd: (totalCostUsd) => set({ totalCostUsd }),
  setIsBuilding: (isBuilding) => set({ isBuilding }),

  generationResults: [],
  isGenerating: false,
  generateError: null,
  setGenerationResults: (generationResults) => set({ generationResults }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerateError: (generateError) => set({ generateError }),
}));
