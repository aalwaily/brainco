'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ----------------------------- Code block ----------------------------- */

function extractLang(className?: string): string {
  if (!className) return '';
  const m = /language-([\w+-]+)/.exec(className);
  return m ? m[1] : '';
}

function PreBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);

  // The <code> child carries `className="language-xxx"` from react-markdown;
  // its textContent is the raw code we want to copy.
  // We can read className from the React child without DOM lookups.
  let lang = '';
  let codeText = '';
  const arr = (Array.isArray(children) ? children : [children]).filter(Boolean) as React.ReactElement[];
  const codeEl = arr.find((c) => (c as React.ReactElement)?.props) as
    | React.ReactElement<{ className?: string; children?: React.ReactNode }>
    | undefined;
  if (codeEl) {
    lang = extractLang(codeEl.props.className);
    const flatten = (node: React.ReactNode): string => {
      if (node == null || node === false) return '';
      if (typeof node === 'string' || typeof node === 'number') return String(node);
      if (Array.isArray(node)) return node.map(flatten).join('');
      const el = node as React.ReactElement<{ children?: React.ReactNode }>;
      return flatten(el.props?.children);
    };
    codeText = flatten(codeEl.props.children);
  }

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {/* ignore */}
  }, [codeText]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/60 px-3 py-1.5 text-[11px]">
        <span className="font-mono uppercase tracking-wider text-muted-foreground">
          {lang || 'text'}
        </span>
        <button
          onClick={onCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {copied
            ? (<><Check className="h-3 w-3" /><span>Copied</span></>)
            : (<><Copy className="h-3 w-3" /><span>Copy</span></>)}
        </button>
      </div>
      <pre
        dir="ltr"
        className="scrollbar-thin overflow-x-auto p-3 text-[12.5px] leading-relaxed"
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

/* ----------------------------- Components ----------------------------- */

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
      // Inside <pre> — keep raw class so highlight.js styles apply
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
  pre: PreBlock,
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

export function Markdown({ children, className }: { children: string; className?: string }) {
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
