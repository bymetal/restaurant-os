"use client";

import { useState } from "react";
import { ArrowLeft, Heart, MoreHorizontal, Search } from "lucide-react";
import { StampProgress } from "@restaurant-os/ui";
import { iconForCategoryName } from "../../../lib/category-icon";
import { formatMoney } from "../../../lib/format";
import type { MenuCategory, PublicBranch, PublicRestaurant } from "../../../lib/menu-types";
import { useCart } from "../../../lib/use-cart";
import { useLoyalty } from "../../../lib/use-loyalty";
import { CategoryTabs } from "./_components/CategoryTabs";
import { ProductCard } from "./_components/ProductCard";
import { ProductImage } from "./_components/ProductImage";
import { StickyCartBar } from "./_components/StickyCartBar";

export function StorefrontMenu({
  restaurant,
  branch,
  categories
}: {
  restaurant: PublicRestaurant;
  branch: PublicBranch;
  categories: MenuCategory[];
}) {
  const visibleCategories = categories.filter((category) => category.products.length > 0);
  const [activeCategoryId, setActiveCategoryId] = useState(visibleCategories[0]?.id ?? "");
  const { cart, addItem } = useCart(restaurant.slug, branch.slug);
  const loyalty = useLoyalty(restaurant.slug);

  const activeCategory = visibleCategories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0];
  const featuredCategory = visibleCategories[0];
  const featured = featuredCategory?.products[0];
  const FeaturedIcon = featuredCategory ? iconForCategoryName(featuredCategory.name) : null;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      <header className="flex items-center justify-between px-4 py-4">
        <button type="button" aria-label="Geri" className="text-slate-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-1 items-center gap-3 px-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {restaurant.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{restaurant.name}</p>
            <p className="truncate text-xs text-slate-500">
              {branch.name} • <span className="text-emerald-600">Açık</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <Search size={18} />
          <Heart size={18} />
          <MoreHorizontal size={18} />
        </div>
      </header>

      {loyalty?.linked && loyalty.program && loyalty.account && (
        <div className="px-4">
          <StampProgress
            title={loyalty.program.name}
            subtitle={
              loyalty.account.rewardAvailable
                ? loyalty.program.rewardDescription
                : `${loyalty.account.stampsUntilReward} damga sonra ${loyalty.program.rewardDescription}`
            }
            balance={loyalty.account.balance}
            goalCount={loyalty.program.goalCount}
          />
        </div>
      )}

      {featured && featuredCategory && FeaturedIcon && (
        <div className="mt-4 px-4">
          <div className="overflow-hidden rounded-xl2 bg-slate-900 text-white">
            <div className="flex items-center gap-4 p-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                <ProductImage photoUrl={featured.photoUrl} name={featured.name} icon={FeaturedIcon} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Öne Çıkan</p>
                <p className="truncate text-base font-bold">{featured.name}</p>
                {featured.description && <p className="line-clamp-1 text-xs text-slate-300">{featured.description}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold">{formatMoney(featured.basePrice)}</span>
                  <button
                    type="button"
                    onClick={() => void addItem(featured.id)}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white"
                  >
                    Sepete Ekle
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 px-4">
        <CategoryTabs categories={visibleCategories} activeId={activeCategory?.id ?? ""} onSelect={setActiveCategoryId} />
      </div>

      {activeCategory && (
        <div className="mt-4 px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{activeCategory.name}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {activeCategory.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                categoryName={activeCategory.name}
                onAdd={() => addItem(product.id)}
              />
            ))}
          </div>
        </div>
      )}

      <StickyCartBar slug={restaurant.slug} branchSlug={branch.slug} cart={cart} />
    </div>
  );
}
