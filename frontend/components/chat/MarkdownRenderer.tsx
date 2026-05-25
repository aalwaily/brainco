'use client';

import { memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/cn';
import { CodeBlock } from './CodeBlock';

/** Block-level elements all carry `dir="auto"` so each block resolves its
 *  own RTL/LTR direction independently — mixed-language responses display
 *  each paragraph on the correct side. */
const components: Components = {
  h1: ({ className, ...p }) => (
    <h1 dir="auto" className={cn('mt-5 mb-2 text-xl font-semibold tracking-tight', className)} {...p} />
  ),
  h2: ({ className, ...p }) => (
    <h2 dir="auto" className={cn('mt-5 mb-2 text-lg font-semibold tracking-tight', className)} {...p} />
  ),
  h3: ({ className, ...p }) => (
    <h3 dir="auto" className={cn('mt-4 mb-1.5 text-base font-semibold tracking-tight', className)} {...p} />
  ),
  h4: ({ className, ...p }) => (
    <h4 dir="auto" className={cn('mt-4 mb-1 text-sm font-semibold tracking-tight', className)} {...p} />
  ),
  p:  ({ className, ...p }) => (
    <p dir="auto" className={cn('my-2 leading-7 first:mt-0 last:mb-0', className)} {...p} />
  ),
  ul: ({ className, ...p }) => (
    <ul dir="auto" className={cn('my-2 ms-5 list-disc space-y-1 marker:text-muted-foreground', className)} {...p} />
  ),
  ol: ({ className, ...p }) => (
    <ol dir="auto" className={cn('my-2 ms-5 list-decimal space-y-1 marker:text-muted-foreground', className)} {...p} />
  ),
  li: ({ className, ...p }) => (
    <li dir="auto" className={cn('leading-7', className)} {...p} />
  ),
  strong: ({ className, ...p }) => (
    <strong className={cn('font-semibold text-foreground', className)} {...p} />
  ),
  em: ({ className, ...p }) => (
    <em className={cn('italic', className)} {...p} />
  ),
  a: ({ className, ...p }) => (
    <a
      target="_blank"
      rel="noreferrer"
      className={cn('font-medium text-primary underline underline-offset-2 hover:text-primary/80', className)}
      {...p}
    />
  ),
  blockquote: ({ className, ...p }) => (
    <blockquote
      dir="auto"
      className={cn('my-3 border-s-2 border-border ps-3 italic text-muted-foreground', className)}
      {...p}
    />
  ),
  hr: ({ className, ...p }) => <hr className={cn('my-4 border-border', className)} {...p} />,
  code: ({ className, children, ...p }) => {
    const isBlock = /(?:language|hljs)/.test(String(className || ''));
    if (isBlock) {
      return (
        <code className={cn('font-mono', className)} {...p}>
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          'rounded-md border border-border/70 bg-muted/60 px-1 py-[1px] text-[0.85em] font-mono',
          className,
        )}
        {...p}
      >
        {children}
      </code>
    );
  },
  pre: (props) => <CodeBlock {...props} />,
  table: ({ className, ...p }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...p} />
    </div>
  ),
  thead: ({ className, ...p }) => (
    <thead className={cn('bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground', className)} {...p} />
  ),
  th: ({ className, ...p }) => (
    <th className={cn('border-b border-border px-3 py-1.5 font-semibold', className)} {...p} />
  ),
  td: ({ className, ...p }) => (
    <td className={cn('border-b border-border/60 px-3 py-1.5 align-top', className)} {...p} />
  ),
  tr: ({ className, ...p }) => (
    <tr className={cn('last:border-b-0', className)} {...p} />
  ),
};

function MarkdownRendererInner({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('text-sm text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Memoized — only re-renders when the content string actually changes.
 *  Important for streaming: a parent re-render fires on every token but
 *  the markdown tree only rebuilds when `children` itself differs. */
export const MarkdownRenderer = memo(MarkdownRendererInner, (a, b) =>
  a.children === b.children && a.className === b.className,
);
