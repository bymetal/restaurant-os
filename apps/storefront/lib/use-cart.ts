"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api-client";

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  businessId: string;
  branchId: string;
  status: string;
  items: CartItem[];
  totalMinor: number;
}

export function useCart(slug: string, branchSlug: string) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<{ cart: Cart }>(`/v1/public/restaurants/${slug}/carts/me`);
      setCart(response.cart);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        const created = await apiFetch<{ cart: Cart }>(`/v1/public/restaurants/${slug}/carts`, {
          method: "POST",
          body: { branchSlug }
        });
        setCart(created.cart);
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, [slug, branchSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (productId: string, quantity = 1) => {
      const idempotencyKey = `add-${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const updated = await apiFetch<Cart>(`/v1/public/restaurants/${slug}/carts/me/items`, {
        method: "POST",
        idempotencyKey,
        body: { productId, quantity }
      });
      setCart(updated);
    },
    [slug]
  );

  return { cart, loading, addItem, refresh };
}
