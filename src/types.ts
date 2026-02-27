export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  image?: string;
}

export interface AppState {
  messages: Message[];
  isRecording: boolean;
  isProcessing: boolean;
  selectedLanguage: Language;
  currentImage: string | null;
}

export const LANGUAGES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
  ja: '日本語',
  ko: '한국어'
};
