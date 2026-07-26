import { apiGet, apiPost } from '@/lib/api-client';
import type { AuthTokens, AuthUser } from '@/types/api';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  register: (input: RegisterInput): Promise<AuthTokens> =>
    apiPost<AuthTokens>('/auth/register', input),

  login: (input: LoginInput): Promise<AuthTokens> => apiPost<AuthTokens>('/auth/login', input),

  /** Clears the refresh cookie server-side; the access token dies with the tab. */
  logout: (): Promise<void> => apiPost<void>('/auth/logout', {}),

  me: (): Promise<AuthUser> => apiGet<AuthUser>('/auth/me'),
};

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};
