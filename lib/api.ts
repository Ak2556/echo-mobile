import EventSource from 'react-native-sse';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = {
  async sendMessage(message: string, onChunk: (chunk: string) => void): Promise<{ id: string, role: 'assistant', content: string }> {
    return new Promise((resolve, reject) => {
      let fullContent = '';
      
      const es = new EventSource(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      es.addEventListener('message', (event) => {
        if (!event.data || event.data === '[DONE]') {
          es.removeAllEventListeners();
          es.close();
          resolve({
            id: Date.now().toString(),
            role: 'assistant',
            content: fullContent,
          });
          return;
        }

        try {
          const data = JSON.parse(event.data);
          if (data.text) {
            fullContent += data.text;
            onChunk(fullContent);
          } else if (data.error) {
            es.removeAllEventListeners();
            es.close();
            reject(new Error(data.error));
          }
        } catch (e) {
          console.error('Error parsing SSE', e);
        }
      });

      es.addEventListener('error', (event) => {
        es.removeAllEventListeners();
        es.close();
        reject(new Error('SSE connection error'));
      });
    });
  }
};
