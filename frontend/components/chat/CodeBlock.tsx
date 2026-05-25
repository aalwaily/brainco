'use client';

import { useCallback, useMemo, useState, ReactNode, isValidElement } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, WrapText } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Pretty language label (e.g. ts → TypeScript). */
const LANG_LABEL: Record<string, string> = {
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX',
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX',
  py: 'Python', python: 'Python',
  sh: 'Bash', bash: 'Bash', shell: 'Bash', zsh: 'Bash',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  md: 'Markdown', markdown: 'Markdown',
  sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS',
  rs: 'Rust', rust: 'Rust', go: 'Go', java: 'Java',
  c: 'C', cpp: 'C++', cs: 'C#',
  php: 'PHP', rb: 'Ruby', kt: 'Kotlin', swift: 'Swift',
  dart: 'Dart', diff: 'Diff', text: 'Text',
};

function prettyLang(lang: string): string {
  if (!lang) return 'Text';
  return LANG_LABEL[lang.toLowerCase()] ?? lang;
}

function extractLang(className?: string): string {
  if (!className) return '';
  const m = /language-([\w+#.-]+)/.exec(className);
  return m ? m[1] : '';
}

/** Flatten a React tree into its raw text content. */
function flatten(node: ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    return flatten(el.props?.children);
  }
  return '';
}

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  /** Hide the line numbers gutter (defaults to true for code with 4+ lines). */
  hideLineNumbers?: boolean;
}

/**
 * ChatGPT-style code block:
 *   - Language badge on the left
 *   - Copy, Wrap-toggle, Collapse buttons on the right
 *   - Optional line numbers gutter (auto-hidden for short snippets)
 *   - Horizontal scroll by default; click "Wrap" to soft-wrap
 *   - Click "Collapse" to fold the body to a one-line summary
 */
export function CodeBlock({ children, className, hideLineNumbers, ...rest }: CodeBlockProps) {
  // The first <code> child carries `className="language-xxx"`.
  const childArray = Array.isArray(children) ? children : [children];
  const codeEl = childArray.find(isValidElement) as
    | React.ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;

  const lang   = extractLang(codeEl?.props.className);
  const label  = prettyLang(lang);
  const raw    = useMemo(() => flatten(codeEl?.props?.children), [codeEl]);
  const lines  = useMemo(() => raw.replace(/\n$/, '').split('\n'), [raw]);
  const showLineNumbers = !hideLineNumbers && lines.length >= 4;

  const [copied, setCopied]       = useState(false);
  const [wrap, setWrap]           = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {/* ignore */}
  }, [raw]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/60 px-3 py-1.5 text-[11px]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand code' : 'Collapse code'}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <span className="font-mono uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {collapsed && (
            <span className="text-muted-foreground">
              · {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWrap((w) => !w)}
            aria-label={wrap ? 'Disable wrap' : 'Enable wrap'}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
              wrap ? 'text-foreground bg-background' : 'text-muted-foreground hover:bg-background hover:text-foreground',
            )}
          >
            <WrapText className="h-3 w-3" />
            <span>Wrap</span>
          </button>
          <button
            onClick={onCopy}
            aria-label="Copy code"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            {copied
              ? (<><Check className="h-3 w-3" /><span>Copied</span></>)
              : (<><Copy className="h-3 w-3" /><span>Copy</span></>)}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="scrollbar-thin overflow-x-auto">
          <pre
            dir="ltr"
            className={cn(
              'min-w-full p-3 text-[12.5px] leading-relaxed',
              wrap && 'whitespace-pre-wrap break-words',
            )}
            {...rest}
          >
            {showLineNumbers ? (
              <div className="flex gap-3">
                <div
                  aria-hidden
                  className="select-none border-e border-border/60 pe-3 text-end font-mono text-muted-foreground/60"
                >
                  {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <div className="flex-1 font-mono">{children}</div>
              </div>
            ) : (
              children
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
