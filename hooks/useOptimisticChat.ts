import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  kind?: string;
  pending?: boolean;
  failed?: boolean;
}

export function useOptimisticChat(conversationId: string, currentUserId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Initial fetch
    supabase.from('direct_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });

    // Targeted WebSocket subscription
    const sub = supabase.channel(`direct_messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, payload => {
        setMessages(prev => {
          // Prevent duplicates if optimistic message already exists
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new as Message];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    const tempId = uuidv4();
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      text: content,
      created_at: new Date().toISOString(),
      kind: 'text',
      pending: true,
    };

    setMessages(prev => [...prev, optimisticMsg]);

    const { error } = await supabase.from('direct_messages').insert([{
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      text: content,
      kind: 'text',
    }]);

    if (error) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false, failed: true } : m));
    } else {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, pending: false } : m));
    }
  }, [conversationId, currentUserId]);

  return { messages, sendMessage };
}
