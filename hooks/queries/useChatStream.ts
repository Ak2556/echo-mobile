import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

export function useChatStream() {
  return useMutation({
    mutationFn: async ({ message, onChunk }: { message: string, onChunk: (chunk: string) => void }) => {
      return apiClient.sendMessage(message, onChunk);
    },
  });
}
