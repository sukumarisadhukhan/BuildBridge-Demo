'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function SafeMarkdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children: linkChildren }) => {
            if (!href) return <span>{linkChildren}</span>;
            try {
              const url = new URL(href, 'https://buildbridge.invalid');
              if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return <span>{linkChildren}</span>;
              return <a href={href} target="_blank" rel="noopener noreferrer">{linkChildren}</a>;
            } catch {
              return <span>{linkChildren}</span>;
            }
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
