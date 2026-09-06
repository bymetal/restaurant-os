import { notFound } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import type { MenuCategory, PublicRestaurant } from "../../../lib/menu-types";
import { StorefrontMenu } from "./StorefrontMenu";

export default async function StorefrontMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurantResponse = await apiFetch<{ restaurant: PublicRestaurant }>(`/v1/public/restaurants/${slug}`).catch(
    () => null
  );
  if (!restaurantResponse) notFound();
  const branch = restaurantResponse.restaurant.branches[0];
  if (!branch) notFound();

  const menuResponse = await apiFetch<{ menu: { categories: MenuCategory[] } }>(
    `/v1/public/restaurants/${slug}/menu?branchSlug=${branch.slug}`
  );

  return <StorefrontMenu restaurant={restaurantResponse.restaurant} branch={branch} categories={menuResponse.menu.categories} />;
}
