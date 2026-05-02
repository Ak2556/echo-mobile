import { ChatMessage, ChatSession } from '../../types';
import { persistGet, persistSet } from '../persist';

export interface ChatSlice {
  // ── Chat Sessions ──
  sessions: ChatSession[];
  currentSessionId: string | null;
  conversationIdBySession: Record<string, string>; // session id → server conversation id
  createSession: (title?: string) => string;
  deleteSession: (id: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setSessionConversationId: (sessionId: string, conversationId: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  updateSessionLastMessage: (id: string, lastMessage: string, messageCount: number) => void;
  branchSession: (fromSessionId: string, throughMessageId: string) => string;
  // ── Messages ──
  messagesBySession: Record<string, ChatMessage[]>;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  removeMessage: (sessionId: string, messageId: string) => void;
  truncateMessagesAfter: (sessionId: string, messageId: string, inclusive?: boolean) => void;
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  getMessages: (sessionId: string) => ChatMessage[];
  clearChatHistory: () => void;
}

export function createChatSlice(set: (partial: object) => void, get: () => ChatSlice): ChatSlice {
  return {
    sessions: persistGet<ChatSession[]>('sessions', []),
    currentSessionId: persistGet<string | null>('currentSessionId', null),
    conversationIdBySession: persistGet<Record<string, string>>('conversationIdBySession', {}),
    createSession: (title) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const now = new Date().toISOString();
      const session: ChatSession = { id, title: title || 'New Chat', lastMessage: '', messageCount: 0, createdAt: now, updatedAt: now };
      const sessions = [session, ...get().sessions];
      persistSet('sessions', sessions);
      persistSet('currentSessionId', id);
      set({ sessions, currentSessionId: id });
      return id;
    },
    deleteSession: (id) => {
      const sessions = get().sessions.filter(s => s.id !== id);
      const { [id]: _removed, ...rest } = get().messagesBySession;
      const { [id]: _convRemoved, ...restConv } = get().conversationIdBySession;
      const currentSessionId = get().currentSessionId === id ? (sessions[0]?.id ?? null) : get().currentSessionId;
      persistSet('sessions', sessions);
      persistSet('messagesBySession', rest);
      persistSet('conversationIdBySession', restConv);
      persistSet('currentSessionId', currentSessionId);
      set({ sessions, messagesBySession: rest, conversationIdBySession: restConv, currentSessionId });
    },
    setCurrentSessionId: (id) => {
      persistSet('currentSessionId', id);
      set({ currentSessionId: id });
    },
    setSessionConversationId: (sessionId, conversationId) => {
      const map = { ...get().conversationIdBySession, [sessionId]: conversationId };
      persistSet('conversationIdBySession', map);
      set({ conversationIdBySession: map });
    },
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
    branchSession: (fromSessionId, throughMessageId) => {
      const prevMessages = get().messagesBySession[fromSessionId] || [];
      const idx = prevMessages.findIndex(m => m.id === throughMessageId);
      const slice = idx >= 0 ? prevMessages.slice(0, idx + 1) : prevMessages.slice();
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const now = new Date().toISOString();
      const fromSession = get().sessions.find(s => s.id === fromSessionId);
      const session: ChatSession = {
        id,
        title: fromSession ? `Branch · ${fromSession.title}` : 'New Chat',
        lastMessage: slice[slice.length - 1]?.content?.slice(0, 80) ?? '',
        messageCount: slice.length,
        createdAt: now,
        updatedAt: now,
      };
      const sessions = [session, ...get().sessions];
      const messagesBySession = { ...get().messagesBySession, [id]: slice };
      persistSet('sessions', sessions);
      persistSet('messagesBySession', messagesBySession);
      persistSet('currentSessionId', id);
      set({ sessions, messagesBySession, currentSessionId: id });
      return id;
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
    removeMessage: (sessionId, messageId) => {
      const prev = get().messagesBySession;
      const msgs = (prev[sessionId] || []).filter(m => m.id !== messageId);
      const updated = { ...prev, [sessionId]: msgs };
      persistSet('messagesBySession', updated);
      set({ messagesBySession: updated });
    },
    truncateMessagesAfter: (sessionId, messageId, inclusive) => {
      const prev = get().messagesBySession;
      const msgs = prev[sessionId] || [];
      const idx = msgs.findIndex(m => m.id === messageId);
      if (idx < 0) return;
      const cut = inclusive ? msgs.slice(0, idx) : msgs.slice(0, idx + 1);
      const updated = { ...prev, [sessionId]: cut };
      persistSet('messagesBySession', updated);
      set({ messagesBySession: updated });
    },
    setMessages: (sessionId, messages) => {
      const updated = { ...get().messagesBySession, [sessionId]: messages };
      persistSet('messagesBySession', updated);
      set({ messagesBySession: updated });
    },
    getMessages: (sessionId) => get().messagesBySession[sessionId] || [],
    clearChatHistory: () => {
      persistSet('sessions', []);
      persistSet('messagesBySession', {});
      persistSet('conversationIdBySession', {});
      persistSet('currentSessionId', null);
      set({ sessions: [], messagesBySession: {}, conversationIdBySession: {}, currentSessionId: null });
    },
  };
}
