import { useAppStore } from "./store.ts";
import { ApiKeyForm } from "./components/ApiKeyForm.tsx";
import { ConsentDialog } from "./components/ConsentDialog.tsx";
import { BuildPanel } from "./components/BuildPanel.tsx";
import { FormatMappingPanel } from "./components/FormatMappingPanel.tsx";
import { PersonaView } from "./components/PersonaView.tsx";
import { GenerateView } from "./components/GenerateView.tsx";

export function App() {
  const { view, apiKey, hasConsented } = useAppStore();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">groa</h1>
          <p className="text-sm text-gray-500">
            ツイートデータから人格プロファイルを抽出し「らしい」テキストを生成する
          </p>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">
        <ApiKeyForm />
        {apiKey && !hasConsented && <ConsentDialog />}
        {apiKey && hasConsented && view === "upload" && <BuildPanel />}
        {apiKey && hasConsented && view === "mapping" && <FormatMappingPanel />}
        {apiKey && hasConsented && view === "building" && <BuildPanel />}
        {apiKey && hasConsented && view === "persona" && <PersonaView />}
        {apiKey && hasConsented && view === "generate" && <GenerateView />}
      </main>
    </div>
  );
}
