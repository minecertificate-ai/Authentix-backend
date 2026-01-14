/**
 * USER SERVICE
 *
 * Business logic layer for user profile management.
 */

import type { UserRepository } from './repository.js';
import type { UserProfile } from './types.js';
import { NotFoundError } from '../../lib/errors/handler.js';

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.repository.getProfile(userId);
  }
}
