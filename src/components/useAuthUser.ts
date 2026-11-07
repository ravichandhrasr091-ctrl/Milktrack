import { useOutletContext } from 'react-router-dom';
import type { AuthUser } from '../services/auth';

export function useAuthUser(): AuthUser {
  return useOutletContext<AuthUser>();
}
