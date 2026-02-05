import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  className?: string;
  tone?: "default" | "answer";
};

export function MarkdownContent({
  content,
  className,
  tone = "default",
}: MarkdownContentProps) {
  const toneClasses =
    tone === "answer"
      ? "text-emerald-900"
      : "text-zinc-800";

  return (
    <div className={`text-sm leading-relaxed ${toneClasses} ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 text-lg font-semibold text-zinc-900">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 text-base font-semibold text-zinc-900">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
              {children}
            </ol>
          ),
          a: ({ href, children }) => (
            <a
              className="text-indigo-600 underline underline-offset-2 hover:text-indigo-500"
              href={href ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ inline, children }) =>
            inline ? (
              <code className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.85em] text-zinc-900">
                {children}
              </code>
            ) : (
              <code className="font-mono text-[0.85em] text-zinc-100">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
