import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownRenderer({ content, dir = 'ltr' }) {
  return (
    <div dir={dir} className="kb-markdown text-white/75 leading-relaxed space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-2xl font-semibold text-white mt-6 mb-3" {...p} />,
          h2: (p) => <h2 className="text-xl font-semibold text-white mt-6 mb-2 pb-1.5 border-b border-white/5" {...p} />,
          h3: (p) => <h3 className="text-base font-semibold text-white mt-4 mb-1.5" {...p} />,
          p: (p) => <p className="text-white/70 leading-relaxed" {...p} />,
          ul: (p) => <ul className="list-disc list-inside space-y-1 text-white/70 pl-1" {...p} />,
          ol: (p) => <ol className="list-decimal list-inside space-y-1 text-white/70 pl-1" {...p} />,
          li: (p) => <li className="text-white/70" {...p} />,
          strong: (p) => <strong className="text-white font-semibold" {...p} />,
          em: (p) => <em className="text-white/80" {...p} />,
          code: ({ inline, className, children, ...p }) => inline ? (
            <code className="text-[#2dd4bf] bg-white/5 px-1.5 py-0.5 rounded text-[0.9em]" {...p}>{children}</code>
          ) : (
            <code className={`block text-[#2dd4bf] bg-white/5 p-3 rounded-lg text-sm overflow-x-auto ${className || ''}`} {...p}>{children}</code>
          ),
          pre: (p) => <pre className="bg-white/5 rounded-lg my-3 overflow-x-auto" {...p} />,
          a: (p) => <a className="text-[#3b82f6] hover:underline" target="_blank" rel="noreferrer" {...p} />,
          hr: () => <hr className="border-white/5 my-6" />,
          blockquote: (p) => <blockquote className="border-l-4 border-[#3b82f6]/40 pl-4 text-white/60 italic my-3" {...p} />,
          img: ({ node, ...p }) => (
            <img className="rounded-lg border border-white/10 my-3 max-w-full" {...p} />
          ),
          input: (p) => (
            <input {...p} disabled className="mr-2 accent-[#2dd4bf] cursor-default align-middle" />
          ),
          table: (p) => <table className="w-full border-collapse my-3 text-sm" {...p} />,
          th: (p) => <th className="border border-white/10 bg-white/5 px-3 py-2 text-left text-white" {...p} />,
          td: (p) => <td className="border border-white/10 px-3 py-2 text-white/70" {...p} />,
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
