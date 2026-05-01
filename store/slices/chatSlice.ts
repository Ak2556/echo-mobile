import { ChatMessage, ChatSession } from '../../types';
import { persistGet, persistSet } from '../persist';

export interface ChatSlice {
  // ── Chat Sessions ──
  sessions: ChatSession[];
  currentSessionId: string | null;
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  updateSessionTitle: (id: string, title: string) => void;
  updateSessionLastMessage: (id: string, lastMessage: string, messageCount: number) => void;
  // ── Messages ──
  messagesBySession: Record<string, ChatMessage[]>;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  getMessages: (sessionId: string) => ChatMessage[];
  clearChatHistory: () => void;
}

export function createChatSlice(set: (partial: object) => void, get: () => ChatSlice): ChatSlice {
  return {
    sessions: persistGet<ChatSession[]>('sessions', []),
    currentSessionId: null,
    createSession: (title) => {
      const id = Date.now().toString();
      const now = new Date().toISOString();
      const session: ChatSession = { id, title: title || 'New Chat', lastMessage: '', messageCount: 0, createdAt: now, updatedAt: now };
      const sessions = [session, ...get().sessions];
      persistSet('sessions', sessions);
      set({ sessions, currentSessionId: id });
      return id;
    },
    deleteSession: (id) => {
      const sessions = get().sessions.filter(s => s.id !== id);
      const { [id]: _removed, ...rest } = get().messagesBySession;
      persistSet('sessions', sessions);
      persistSet('messagesBySession', rest);
      set({ sessions, messagesBySession: rest });
    },
    setCurrentSessionId: (id) => set({ currentSessionId: id }),
    updateSessionTitle: (id, title) => {
      const sessions = get().sessions.map(s => s.id === id ? { ...s, title } : s);
      persistSet('sessions', sessions);
      set({ sessions });
    },
    updateSessionLastMessage: (id, lastMessage, messageCount) => {
      const sessions = get().sessions.map(s =>
        s.id === id ? { ...s, lastMessage, messageCount, updatedAt: new Date().toISOString() } : s
      );
      persistSet('sessions', sessions);
      set({ sessions });
    },
    messagesBySession: persistGet<Record<string, ChatMessage[]>>('messagesBySession', {}),
    addMessage: (sessionId, message) => {
      const prev = get().messagesBySession;
      const msgs = [...(prev[sessionId] || []), message];
      const updated = { ...prev, [sessionId]: msgs };
      persistSet('messagesBySession', updated);
      set({ messagesBySession: updated });
    },
    updateMessage: (sessionId, messageId, content) => {
      const prev = get().messagesBySession;
      const msgs = (prev[sessionId] || []).map(m => m.id === messageId ? { ...m, content } : m);
      const updated = { ...prev, [sessionId]: msgs };
      persistSet('messagesBySession', updated);
      set({ messagesBySession: updated });
    },
    getMessages: (sessionId) => get().messagesBySession[sessionId] || [],
    clearChatHistory: () => {
      persistSet('sessions', []);
      persistSet('messagesBySession', {});
      set({ sessions: [], messagesBySession: {}, currentSessionId: null });
    },
  };
}
