export type Lang = 'en' | 'ar';

type Dict = Record<string, string>;

const en: Dict = {
  app_name: 'AI Company Brain',
  app_tag: 'Local · DeepSeek · RAG',
  nav_chat: 'Chat',
  nav_files: 'Upload Company files',
  nav_generated: 'Generated',

  chat_placeholder: 'Ask anything about your company files…',
  chat_send: 'Send',
  chat_welcome_title: 'What can I help you with?',
  chat_welcome_sub: 'Ask about employees, contracts, generate warning letters, and more.',
  greet_morning: 'Good morning',
  greet_afternoon: 'Good afternoon',
  greet_evening: 'Good evening',
  greet_night: 'Good night',
  chat_sources: 'Sources',
  chat_download: 'Download',
  suggest_show_emp: 'Show employee 1002',
  suggest_find_iqama: 'Find employee by iqama 1234',
  suggest_policy: 'What is the lateness policy?',
  suggest_warning: 'Create delay warning for employee 1234',

  files_title: 'Company files',
  files_sub: 'Everything in company_data/. Upload to ingest automatically.',
  files_drop: 'Drop files here or click to choose',
  files_drop_sub: 'PDF · DOCX · XLSX · CSV · TXT',
  files_uploading: 'Uploading & indexing…',
  files_reindex: 'Re-index all',
  files_delete: 'Delete',
  files_empty: 'No files yet. Drop some to get started.',
  files_confirm_delete: 'Delete {name}? This will remove its vectors from the index.',

  gen_title: 'Generated documents',
  gen_sub: 'Files produced by the assistant — warning letters, summaries, etc.',
  gen_empty_title: 'Nothing generated yet.',
  gen_empty_sub: 'Ask the chat to "Create delay warning for employee 1234" to produce one.',
  gen_open_chat: 'Open chat',

  side_files: 'Files',
  side_docs: 'Documents',
  side_empty_files: 'No files yet.',
  side_empty_docs: 'No documents yet.',

  theme_light: 'Light',
  theme_dark: 'Dark',
};

const ar: Dict = {
  app_name: 'دماغ الشركة الذكي',
  app_tag: 'محلي · DeepSeek · RAG',
  nav_chat: 'المحادثة',
  nav_files: 'رفع ملفات الشركة',
  nav_generated: 'المُولّدة',

  chat_placeholder: 'اسأل أي شيء عن ملفات شركتك…',
  chat_send: 'إرسال',
  chat_welcome_title: 'كيف يمكنني مساعدتك؟',
  chat_welcome_sub: 'اسأل عن الموظفين، العقود، أنشئ خطابات إنذار، والمزيد.',
  greet_morning: 'صباح الخير',
  greet_afternoon: 'مساء الخير',
  greet_evening: 'مساء الخير',
  greet_night: 'مساء الخير',
  chat_sources: 'المصادر',
  chat_download: 'تنزيل',
  suggest_show_emp: 'أظهر الموظف 1002',
  suggest_find_iqama: 'ابحث عن موظف برقم إقامة 1234',
  suggest_policy: 'ما هي سياسة التأخير؟',
  suggest_warning: 'أنشئ إنذار تأخير للموظف 1234',

  files_title: 'ملفات الشركة',
  files_sub: 'كل ما في مجلد company_data/. ارفع الملفات لفهرستها تلقائيًا.',
  files_drop: 'أفلت الملفات هنا أو انقر للاختيار',
  files_drop_sub: 'PDF · DOCX · XLSX · CSV · TXT',
  files_uploading: 'جاري الرفع والفهرسة…',
  files_reindex: 'إعادة الفهرسة',
  files_delete: 'حذف',
  files_empty: 'لا توجد ملفات بعد. أضف بعضها للبدء.',
  files_confirm_delete: 'حذف {name}؟ سيُزال من الفهرس.',

  gen_title: 'المستندات المُولّدة',
  gen_sub: 'الملفات التي أنشأها المساعد — خطابات إنذار، ملخصات، إلخ.',
  gen_empty_title: 'لم يُولَّد أي مستند بعد.',
  gen_empty_sub: 'اطلب من المحادثة "أنشئ إنذار تأخير للموظف 1234" لتجربة ذلك.',
  gen_open_chat: 'فتح المحادثة',

  side_files: 'الملفات',
  side_docs: 'المستندات',
  side_empty_files: 'لا توجد ملفات.',
  side_empty_docs: 'لا توجد مستندات.',

  theme_light: 'فاتح',
  theme_dark: 'داكن',
};

const dicts: Record<Lang, Dict> = { en, ar };

export function t(lang: Lang, key: keyof typeof en, vars?: Record<string, string>): string {
  let s = (dicts[lang] as Dict)[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}
