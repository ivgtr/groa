import Markdown from "react-markdown";

interface PersonaBodyProps {
  body: string;
}

export function PersonaBody({ body }: PersonaBodyProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        ペルソナ本文
      </h2>
      <div className="bg-white rounded-lg border border-gray-200 p-6 prose prose-gray max-w-none [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:text-gray-900 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-gray-800 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:text-gray-700 [&_p]:text-sm [&_p]:text-gray-700 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:text-sm [&_li]:text-gray-700 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_strong]:font-semibold [&_strong]:text-gray-900">
        <Markdown>{body}</Markdown>
      </div>
    </section>
  );
}
