/**
 * CATALOG REPOSITORY
 *
 * Data access layer for catalog/category management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryItem } from './types.js';

export interface EffectiveCategoryRow {
  organization_id: string;
  category_id: string;
  key: string;
  name: string;
  group_key: string | null;
  sort_order: number | null;
  is_org_custom: boolean;
  is_hidden: boolean;
}

export interface EffectiveSubcategoryRow {
  organization_id: string;
  subcategory_id: string;
  category_id: string;
  key: string;
  name: string;
  sort_order: number | null;
  is_org_custom: boolean;
  is_hidden: boolean;
}

export class CatalogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get organization industry_id
   * Returns null if industry is not set
   */
  async getOrganizationIndustry(organizationId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('industry_id')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) {
      throw new Error(`[CatalogRepository.getOrganizationIndustry] Failed to fetch organization industry: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return data?.industry_id || null;
  }

  /**
   * Get effective categories for organization
   * Uses v_effective_categories view (no legacy tables)
   */
  async getEffectiveCategories(organizationId: string): Promise<EffectiveCategoryRow[]> {
    const { data, error } = await this.supabase
      .from('v_effective_categories')
      .select('organization_id, category_id, key, name, group_key, sort_order, is_org_custom, is_hidden')
      .eq('organization_id', organizationId)
      .eq('is_hidden', false)
      .order('group_key', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`[CatalogRepository.getEffectiveCategories] Failed to fetch categories: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return (data ?? []) as EffectiveCategoryRow[];
  }

  /**
   * Validate that category belongs to organization and is not hidden
   * Used for security: prevent leaking categories from other orgs
   */
  async validateCategoryForOrganization(
    organizationId: string,
    categoryId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('v_effective_categories')
      .select('category_id')
      .eq('organization_id', organizationId)
      .eq('category_id', categoryId)
      .eq('is_hidden', false)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected if category doesn't belong to org)
      throw new Error(`[CatalogRepository.validateCategoryForOrganization] Failed to validate category: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return !!data;
  }

  /**
   * Get effective subcategories for a category
   * Uses v_effective_subcategories view (no legacy tables)
   */
  async getEffectiveSubcategories(
    organizationId: string,
    categoryId: string
  ): Promise<EffectiveSubcategoryRow[]> {
    const { data, error } = await this.supabase
      .from('v_effective_subcategories')
      .select('organization_id, subcategory_id, category_id, key, name, sort_order, is_org_custom, is_hidden')
      .eq('organization_id', organizationId)
      .eq('category_id', categoryId)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`[CatalogRepository.getEffectiveSubcategories] Failed to fetch subcategories: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return (data ?? []) as EffectiveSubcategoryRow[];
  }

  /**
   * Validate that subcategory belongs to organization, category, and is not hidden
   * Used for security: prevent leaking subcategories from other orgs/categories
   */
  async validateSubcategoryForOrganization(
    organizationId: string,
    subcategoryId: string,
    categoryId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('v_effective_subcategories')
      .select('subcategory_id')
      .eq('organization_id', organizationId)
      .eq('subcategory_id', subcategoryId)
      .eq('category_id', categoryId)
      .eq('is_hidden', false)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (expected if subcategory doesn't belong to org/category)
      throw new Error(`[CatalogRepository.validateSubcategoryForOrganization] Failed to validate subcategory: ${error.message} (PostgREST code: ${error.code || 'unknown'})`);
    }

    return !!data;
  }
}
