import { FileSpreadsheet, FileText, FileType2, Sheet, File as FileIcon, LucideIcon } from 'lucide-react';

export function iconForFile(type: string): { Icon: LucideIcon; color: string } {
  const t = type.toLowerCase().replace(/^\./, '');
  switch (t) {
    case 'pdf':  return { Icon: FileType2,        color: 'text-red-500' };
    case 'docx':
    case 'doc':  return { Icon: FileText,         color: 'text-sky-500' };
    case 'xlsx':
    case 'xls':  return { Icon: FileSpreadsheet,  color: 'text-emerald-500' };
    case 'csv':  return { Icon: Sheet,            color: 'text-emerald-500' };
    case 'txt':  return { Icon: FileText,         color: 'text-zinc-400' };
    default:     return { Icon: FileIcon,         color: 'text-muted-foreground' };
  }
}
