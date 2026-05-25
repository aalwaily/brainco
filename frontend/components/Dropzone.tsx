'use client';

import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { uploadFiles, Category } from '@/lib/api';
import { useLang } from '@/app/providers';
import { t } from '@/lib/i18n';

const ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.txt';

export function Dropzone({
  onUploaded,
  category,
  compact,
  title,
  subtitle,
}: {
  onUploaded?: () => void;
  /** When set, files dropped here are forced into this category. Omit to auto-classify. */
  category?: Category;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const { lang } = useLang();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const r = await uploadFiles(Array.from(list), category);
      const summary = r.uploaded
        .map((u) => {
          const tag =
            u.classified_by === 'ai'      ? ' (AI)'
            : u.classified_by === 'keyword' ? ''
            : '';
          return `${u.name} → ${u.category}${tag}`;
        })
        .join('\n');
      toast.success(
        `Uploaded ${r.uploaded.length} file${r.uploaded.length === 1 ? '' : 's'}`,
        { description: summary, duration: 6000 },
      );
      onUploaded?.();
    } catch (e: unknown) {
      toast.error('Upload failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    void upload(e.dataTransfer.files);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void upload(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <motion.div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      animate={{ scale: drag ? 1.01 : 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-4 py-6' : 'px-6 py-14',
        drag
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-ring/50 hover:bg-accent/30',
        busy && 'pointer-events-none opacity-70',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
          drag && 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(60% 60% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%)',
        }}
      />
      <div className={cn(
        'relative grid place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-105',
        compact ? 'h-9 w-9' : 'h-12 w-12',
      )}>
        {busy ? <Loader2 className={compact ? 'h-4 w-4 animate-spin' : 'h-5 w-5 animate-spin'} />
              : <UploadCloud className={compact ? 'h-4 w-4' : 'h-5 w-5'} />}
      </div>
      <div className={cn('relative font-medium text-foreground', compact ? 'mt-2 text-xs' : 'mt-4 text-sm')}>
        {busy
          ? t(lang, 'files_uploading')
          : (title ?? t(lang, 'files_drop'))}
      </div>
      <div className={cn('relative text-muted-foreground', compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-xs')}>
        {subtitle ?? t(lang, 'files_drop_sub')}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={onChange}
        className="hidden"
      />
    </motion.div>
  );
}
