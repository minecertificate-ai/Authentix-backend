/**
 * CATALOG TYPES
 *
 * Types for catalog/category management.
 */

export interface CategoryItem {
  id: string;
  name: string;
  key: string;
  sort_order: number | null;
  is_org_custom: boolean;
}

export interface CategoryGroup {
  group_key: string;
  label: string;
  items: CategoryItem[];
}

export interface CategoriesResponse {
  groups: CategoryGroup[];
  flat?: CategoryItem[]; // Optional flat list for convenience
}

export interface SubcategoryItem {
  id: string;
  key: string;
  name: string;
  sort_order: number | null;
  is_org_custom: boolean;
}

export interface SubcategoriesResponse {
  category_id: string;
  items: SubcategoryItem[];
}
