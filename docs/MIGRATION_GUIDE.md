# QuantChat Frontend — Migration Guide
**Purpose:** Step-by-step code examples for transitioning from design prototype to production app

---

## Phase 1: Setup Vite + TypeScript

### 1a. Install & Initialize
```bash
npm create vite@latest quantchat-frontend -- --template react-ts
cd quantchat-frontend
npm install
npm install -D @types/react @types/react-dom
```

### 1b. Project Structure
```
src/
├── components/
│   ├── ChatApp.tsx
│   ├── DevicesApp.tsx
│   ├── CallApp.tsx
│   └── ...
├── hooks/
│   ├── useChat.ts
│   ├── useMessages.ts
│   └── useAuth.ts
├── store/
│   ├── authStore.ts
│   ├── uiStore.ts
│   └── index.ts
├── api/
│   ├── client.ts
│   ├── messages.ts
│   ├── users.ts
│   └── auth.ts
├── types/
│   ├── index.ts
│   ├── messages.ts
│   └── user.ts
├── styles/
│   ├── tokens.css
│   ├── globals.css
│   └── index.css
├── App.tsx
└── main.tsx
```

---

## Phase 2: Define TypeScript Types

### 2a. Create `src/types/index.ts`
```typescript
// Core domain types
export type MessageState = "queued" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;  // ISO 8601
  state: MessageState;
  attachment?: Attachment;
  quote?: {
    messageId: string;
    senderId: string;
    text: string;
  };
  reactions?: Reaction[];
  revokedAt?: string;  // ISO 8601 or null if not revoked
}

export interface Attachment {
  kind: "file" | "image" | "video";
  name: string;
  size: number;
  mimeType: string;
  url: string;
  encryptedHash?: string;
}

export interface Reaction {
  emoji: string;
  senderIds: string[];
  count: number;
}

export type ConversationKind = "dm" | "group" | "bot";

export interface Conversation {
  id: string;
  kind: ConversationKind;
  name: string;
  members: string[];
  preview?: string;
  lastMessageTimestamp?: string;
  unreadCount: number;
  isPinned: boolean;
  isOnline?: boolean;  // Only for DMs
  avatarUrl?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  role?: string;
  avatar?: string;
  colorHue?: number;
  isOnline?: boolean;
  lastSeen?: string;  // ISO 8601
}

export interface Device {
  id: string;
  name: string;
  kind: "phone" | "laptop" | "tablet" | "watch";
  os: string;
  lastSeen: string;  // ISO 8601
  isLinked: boolean;
  publicKey?: string;
  trust?: "trusted" | "unverified" | "revoked";
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;  // seconds
  tokenType: "Bearer";
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: AuthToken | null;
  isLoading: boolean;
  error?: string;
}
```

---

## Phase 3: Setup State Management (Zustand)

### 3a. Create `src/store/authStore.ts`
```typescript
import { create } from 'zustand';
import { AuthState, User, AuthToken } from '../types';
import * as authAPI from '../api/auth';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: AuthToken) => void;
  setUser: (user: User) => void;
  refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  token: null,
  isLoading: false,
  error: undefined,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: undefined });
    try {
      const { token, user } = await authAPI.login(email, password);
      set({
        isAuthenticated: true,
        token,
        user,
        isLoading: false,
      });
      // Persist to localStorage
      localStorage.setItem('token', JSON.stringify(token));
      localStorage.setItem('user', JSON.stringify(user));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      });
      throw error;
    }
  },

  logout: () => {
    set({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  setToken: (token: AuthToken) => {
    set({ token });
  },

  setUser: (user: User) => {
    set({ user });
  },

  refreshToken: async () => {
    const { token } = get();
    if (!token?.refreshToken) return;

    try {
      const newToken = await authAPI.refreshToken(token.refreshToken);
      set({ token: newToken });
    } catch (error) {
      get().logout();
    }
  },
}));
```

### 3b. Create `src/store/uiStore.ts`
```typescript
import { create } from 'zustand';

type Theme = 'light' | 'dark';
type Density = 'compact' | 'regular' | 'comfy';

interface UIStore {
  theme: Theme;
  density: Density;
  accentHue: number;
  sidebarOpen: boolean;
  activeConversationId: string | null;

  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setAccentHue: (hue: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  theme: 'light',
  density: 'regular',
  accentHue: 145,
  sidebarOpen: true,
  activeConversationId: null,

  setTheme: (theme: Theme) => {
    set({ theme });
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  setDensity: (density: Density) => {
    set({ density });
    localStorage.setItem('density', density);
  },

  setAccentHue: (hue: number) => {
    set({ accentHue: hue });
    document.documentElement.style.setProperty('--qc-accent-h', String(hue));
  },

  setSidebarOpen: (open: boolean) => {
    set({ sidebarOpen: open });
  },

  setActiveConversation: (id: string | null) => {
    set({ activeConversationId: id });
  },
}));
```

---

## Phase 4: Setup API Client

### 4a. Create `src/api/client.ts`
```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor: add auth token
    this.client.interceptors.request.use((config) => {
      const { token } = useAuthStore.getState();
      if (token?.accessToken) {
        config.headers.Authorization = `Bearer ${token.accessToken}`;
      }
      return config;
    });

    // Response interceptor: handle 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await useAuthStore.getState().refreshToken();
            const { token } = useAuthStore.getState();
            originalRequest.headers.Authorization = `Bearer ${token?.accessToken}`;
            return this.client(originalRequest);
          } catch {
            useAuthStore.getState().logout();
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.get<T>(url, config);
  }

  post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.post<T>(url, data, config);
  }

  put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.put<T>(url, data, config);
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.delete<T>(url, config);
  }
}

export const apiClient = new APIClient();
```

### 4b. Create `src/api/messages.ts`
```typescript
import { apiClient } from './client';
import { Message } from '../types';

export interface SendMessageRequest {
  conversationId: string;
  text: string;
  attachmentId?: string;
  quoteId?: string;
}

export interface SendMessageResponse {
  message: Message;
  sequenceNumber: number;  // For ordering
}

export const messagesAPI = {
  // Get messages in conversation with pagination
  async getMessages(
    conversationId: string,
    { limit = 50, before?: string } = {}
  ) {
    const response = await apiClient.get<Message[]>('/messages', {
      params: { conversationId, limit, before },
    });
    return response.data;
  },

  // Send a message
  async sendMessage(req: SendMessageRequest) {
    const response = await apiClient.post<SendMessageResponse>(
      '/messages',
      req
    );
    return response.data;
  },

  // Edit a message
  async editMessage(messageId: string, text: string) {
    const response = await apiClient.put<Message>(`/messages/${messageId}`, {
      text,
    });
    return response.data;
  },

  // Revoke/delete a message
  async revokeMessage(messageId: string) {
    const response = await apiClient.delete<Message>(
      `/messages/${messageId}`
    );
    return response.data;
  },

  // React to a message
  async addReaction(messageId: string, emoji: string) {
    const response = await apiClient.post(`/messages/${messageId}/reactions`, {
      emoji,
    });
    return response.data;
  },

  // Remove reaction
  async removeReaction(messageId: string, emoji: string) {
    const response = await apiClient.delete(
      `/messages/${messageId}/reactions/${emoji}`
    );
    return response.data;
  },
};
```

---

## Phase 5: Setup React Query for Server State

### 5a. Create `src/hooks/useMessages.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagesAPI, SendMessageRequest } from '../api/messages';
import { Message } from '../types';

export const useMessages = (conversationId: string | null) => {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      conversationId
        ? messagesAPI.getMessages(conversationId)
        : Promise.resolve([]),
    enabled: !!conversationId,
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: SendMessageRequest) => messagesAPI.sendMessage(req),
    onSuccess: (data, req) => {
      // Optimistic update
      queryClient.setQueryData(
        ['messages', req.conversationId],
        (old: Message[] | undefined) => [
          ...(old || []),
          data.message,
        ]
      );
    },
    onError: (error) => {
      console.error('Failed to send message:', error);
    },
  });
};

export const useRevokeMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messagesAPI.revokeMessage(messageId),
    onSuccess: (data) => {
      // Update all affected queries
      queryClient.setQueriesData(
        { queryKey: ['messages'] },
        (old: Message[] | undefined) =>
          old?.map((m) => (m.id === data.id ? data : m)) || []
      );
    },
  });
};
```

---

## Phase 6: Rewrite Chat Component with TypeScript

### 6a. Create `src/components/ChatApp.tsx`
```typescript
import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useMessages, useSendMessage } from '../hooks/useMessages';
import { Conversation, Message } from '../types';

import ChatRail from './ChatRail';
import ChatList from './ChatList';
import ChatThread from './ChatThread';
import ChatDetails from './ChatDetails';

interface ChatAppProps {
  conversations: Conversation[];
  isLoading: boolean;
}

export const ChatApp: React.FC<ChatAppProps> = ({
  conversations,
  isLoading,
}) => {
  const { activeConversationId, setActiveConversation, density, theme } =
    useUIStore();
  const { user } = useAuthStore();

  const conversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    activeConversationId
  );

  const { mutate: sendMessage, isPending: isSending } = useSendMessage();

  const [draft, setDraft] = React.useState('');

  const handleSend = () => {
    if (!draft.trim() || !activeConversationId) return;

    sendMessage(
      {
        conversationId: activeConversationId,
        text: draft,
      },
      {
        onSuccess: () => {
          setDraft('');
        },
      }
    );
  };

  if (!user) {
    return <div>Not authenticated</div>;
  }

  return (
    <div
      className="qc qc-chat-app"
      data-density={density}
      data-theme={theme}
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 320px 1fr 280px',
        height: '100vh',
        minHeight: 0,
        background: 'var(--qc-bg)',
      }}
    >
      <ChatRail conversations={conversations} />

      <ChatList
        conversations={conversations}
        activeId={activeConversationId}
        onPick={setActiveConversation}
      />

      {conversation && (
        <>
          <ChatThread
            conversation={conversation}
            messages={messages}
            draft={draft}
            setDraft={setDraft}
            onSend={handleSend}
            isSending={isSending}
            isLoading={messagesLoading}
          />

          <ChatDetails conversation={conversation} />
        </>
      )}
    </div>
  );
};

export default ChatApp;
```

---

## Phase 7: Setup WebSocket for Real-Time

### 7a. Create `src/api/websocket.ts`
```typescript
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { Message } from '../types';

interface WSMessage {
  type: 'message:new' | 'message:edited' | 'message:revoked' | 'user:status';
  payload: any;
}

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { token } = useAuthStore();

  useEffect(() => {
    if (!token?.accessToken) return;

    const wsUrl = (process.env.REACT_APP_WS_URL || 'ws://localhost:3000').replace(
      'http',
      'ws'
    );

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Authenticate WebSocket connection
      ws.send(
        JSON.stringify({
          type: 'auth',
          token: token.accessToken,
        })
      );
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      const msg: WSMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'message:new': {
          const newMessage: Message = msg.payload;
          queryClient.setQueriesData(
            { queryKey: ['messages', newMessage.conversationId] },
            (old: Message[] | undefined) => [...(old || []), newMessage]
          );
          break;
        }

        case 'message:edited': {
          const edited: Message = msg.payload;
          queryClient.setQueriesData(
            { queryKey: ['messages', edited.conversationId] },
            (old: Message[] | undefined) =>
              old?.map((m) => (m.id === edited.id ? edited : m))
          );
          break;
        }

        case 'message:revoked': {
          const revoked: Message = msg.payload;
          queryClient.setQueriesData(
            { queryKey: ['messages'] },
            (old: Message[] | undefined) =>
              old?.map((m) => (m.id === revoked.id ? revoked : m))
          );
          break;
        }

        case 'user:status': {
          const { userId, isOnline } = msg.payload;
          queryClient.setQueriesData(
            { queryKey: ['users'] },
            (old: any[] | undefined) =>
              old?.map((u) =>
                u.id === userId ? { ...u, isOnline } : u
              )
          );
          break;
        }
      }
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token?.accessToken, queryClient]);
};
```

---

## Phase 8: Environment Configuration

### 8a. Create `.env.example`
```bash
# API Configuration
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_WS_URL=ws://localhost:3000

# Auth
REACT_APP_AUTH_TYPE=oauth2  # or 'custom'
REACT_APP_OAUTH_CLIENT_ID=your_client_id
REACT_APP_OAUTH_REDIRECT_URI=http://localhost:5173/auth/callback

# Features
REACT_APP_ENABLE_AI_ASSISTANT=true
REACT_APP_ENABLE_VAULT=true
REACT_APP_ENABLE_CALLS=false  # Until SFU is ready

# Analytics
REACT_APP_SENTRY_DSN=
REACT_APP_ANALYTICS_ID=

# Environment
NODE_ENV=development
REACT_APP_VERSION=0.1.0
```

### 8b. Create `src/config.ts`
```typescript
export const config = {
  api: {
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
    wsURL: process.env.REACT_APP_WS_URL || 'ws://localhost:3000',
  },
  auth: {
    type: (process.env.REACT_APP_AUTH_TYPE || 'oauth2') as 'oauth2' | 'custom',
    oauthClientId: process.env.REACT_APP_OAUTH_CLIENT_ID || '',
    oauthRedirectUri: process.env.REACT_APP_OAUTH_REDIRECT_URI || '',
  },
  features: {
    ai: process.env.REACT_APP_ENABLE_AI_ASSISTANT === 'true',
    vault: process.env.REACT_APP_ENABLE_VAULT === 'true',
    calls: process.env.REACT_APP_ENABLE_CALLS === 'true',
  },
  version: process.env.REACT_APP_VERSION || '0.0.0',
};
```

---

## Phase 9: Testing Setup

### 9a. Create `src/components/__tests__/ChatApp.test.tsx`
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, userEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatApp } from '../ChatApp';
import { useAuthStore } from '../../store/authStore';

// Mock the stores
vi.mock('../../store/authStore');
vi.mock('../../store/uiStore');
vi.mock('../../hooks/useMessages');

describe('ChatApp', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(useAuthStore).mockReturnValue({
      user: {
        id: 'user-1',
        name: 'Test User',
      },
    } as any);
  });

  it('should render chat interface', () => {
    const conversations = [
      {
        id: 'conv-1',
        kind: 'dm' as const,
        name: 'Test User',
        members: ['user-1', 'user-2'],
        unreadCount: 0,
        isPinned: false,
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <ChatApp conversations={conversations} isLoading={false} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('should send a message', async () => {
    const user = userEvent.setup();
    // ... test implementation
  });
});
```

---

## Phase 10: Build Configuration

### 10a. Create `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    process.env.ANALYZE && visualizer({ open: true }),
  ].filter(Boolean),

  build: {
    target: 'ES2020',
    minify: 'terser',
    sourcemap: process.env.NODE_ENV === 'production' ? false : true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          store: ['zustand'],
        },
      },
    },
  },

  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
});
```

---

## Implementation Checklist

```markdown
- [ ] Phase 1: Vite + TypeScript setup
  - [ ] npm create vite
  - [ ] Install dependencies
  - [ ] Configure tsconfig.json
  
- [ ] Phase 2: Define TypeScript types
  - [ ] Create types/index.ts
  - [ ] Define Message, Conversation, User, Device types
  - [ ] Create shared interfaces
  
- [ ] Phase 3: State management
  - [ ] Install zustand
  - [ ] Create authStore
  - [ ] Create uiStore
  - [ ] Implement persistence
  
- [ ] Phase 4: API client
  - [ ] Create API client with axios
  - [ ] Setup request/response interceptors
  - [ ] Create API module (messages, users, etc.)
  
- [ ] Phase 5: React Query
  - [ ] Install @tanstack/react-query
  - [ ] Create custom hooks
  - [ ] Setup QueryClient
  
- [ ] Phase 6: Component migration
  - [ ] Rewrite ChatApp.tsx
  - [ ] Migrate other components
  - [ ] Remove design canvas from production build
  
- [ ] Phase 7: WebSocket
  - [ ] Implement WebSocket client
  - [ ] Real-time message sync
  - [ ] User status updates
  
- [ ] Phase 8: Environment config
  - [ ] Create .env files
  - [ ] Setup environment types
  - [ ] Validate configuration
  
- [ ] Phase 9: Testing
  - [ ] Setup Vitest + RTL
  - [ ] Write unit tests
  - [ ] Setup E2E tests (Playwright)
  
- [ ] Phase 10: Build & Deploy
  - [ ] Optimize bundle
  - [ ] Setup CI/CD
  - [ ] Configure production deployment
```

---

**Next:** Estimate 4-6 weeks total for this migration with a 2-person frontend team.
