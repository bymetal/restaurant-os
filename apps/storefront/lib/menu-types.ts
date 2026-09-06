export interface MenuProduct {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  photoUrl: string | null;
  basePrice: number;
  active: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  products: MenuProduct[];
}

export interface PublicBranch {
  id: string;
  slug: string;
  name: string;
  addressText: string | null;
}

export interface PublicRestaurant {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  branches: PublicBranch[];
}
