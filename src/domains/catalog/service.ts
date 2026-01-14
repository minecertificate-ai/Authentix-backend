/**
 * CATALOG SERVICE
 *
 * Business logic layer for catalog/category management.
 */

import type { CatalogRepository } from './repository.js';
import type { CategoriesResponse, CategoryGroup, CategoryItem, SubcategoriesResponse, SubcategoryItem } from './types.js';
import { ConflictError, NotFoundError } from '../../lib/errors/handler.js';

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  /**
   * Get categories grouped by group_key
   * Validates industry_id is set before returning categories
   */
  async getCategories(organizationId: string): Promise<CategoriesResponse> {
    // Check if organization has industry set
    const industryId = await this.repository.getOrganizationIndustry(organizationId);
    
    if (!industryId) {
      throw new ConflictError('Organization industry is required before selecting categories', {
        code: 'ORG_INDUSTRY_REQUIRED',
        org_id: organizationId,
      });
    }

    // Fetch effective categories from view
    const categories = await this.repository.getEffectiveCategories(organizationId);

    // Group categories by group_key
    const groupsMap = new Map<string, CategoryItem[]>();
    
    for (const category of categories) {
      // Use group_key or default to 'other'
      const groupKey = category.group_key || 'other';
      
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, []);
      }
      
      groupsMap.get(groupKey)!.push({
        id: category.category_id,
        name: category.name,
        key: category.key,
        sort_order: category.sort_order,
        is_org_custom: category.is_org_custom,
      });
    }

    // Convert to array with proper ordering
    const groups: CategoryGroup[] = [];
    
    // Define stable group ordering (course_certificates first, company_work second)
    const groupOrder = ['course_certificates', 'company_work'];
    const groupLabels: Record<string, string> = {
      course_certificates: 'Course Certificates',
      company_work: 'Company Work',
    };

    // Add known groups in stable order
    for (const groupKey of groupOrder) {
      const items = groupsMap.get(groupKey);
      if (items && items.length > 0) {
        groups.push({
          group_key: groupKey,
          label: groupLabels[groupKey] || groupKey,
          items,
        });
        groupsMap.delete(groupKey);
      }
    }

    // Add remaining groups (unknown group_keys) in alphabetical order
    const remainingGroups = Array.from(groupsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupKey, items]) => ({
        group_key: groupKey,
        label: groupLabels[groupKey] || this.formatGroupLabel(groupKey),
        items,
      }));

    groups.push(...remainingGroups);

    // Create flat list for convenience
    const flat: CategoryItem[] = categories.map(category => ({
      id: category.category_id,
      name: category.name,
      key: category.key,
      sort_order: category.sort_order,
      is_org_custom: category.is_org_custom,
    }));

    return {
      groups,
      flat,
    };
  }

  /**
   * Get subcategories for a category
   * Validates category belongs to organization before returning subcategories
   */
  async getSubcategories(organizationId: string, categoryId: string): Promise<SubcategoriesResponse> {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(categoryId)) {
      throw new NotFoundError('Invalid category ID format');
    }

    // Validate category belongs to organization (anti-leak security check)
    const isValidCategory = await this.repository.validateCategoryForOrganization(
      organizationId,
      categoryId
    );

    if (!isValidCategory) {
      throw new NotFoundError('Category not found for organization', {
        code: 'category_not_found_for_org',
        category_id: categoryId,
        organization_id: organizationId,
      });
    }

    // Fetch effective subcategories from view
    const subcategories = await this.repository.getEffectiveSubcategories(
      organizationId,
      categoryId
    );

    // Map to response format
    const items: SubcategoryItem[] = subcategories.map(subcategory => ({
      id: subcategory.subcategory_id,
      key: subcategory.key,
      name: subcategory.name,
      sort_order: subcategory.sort_order,
      is_org_custom: subcategory.is_org_custom,
    }));

    return {
      category_id: categoryId,
      items,
    };
  }

  /**
   * Format group key into human-readable label
   */
  private formatGroupLabel(groupKey: string): string {
    return groupKey
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
}
