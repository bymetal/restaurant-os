import { Coffee, Cookie, IceCream, Pizza, Sandwich, UtensilsCrossed, type LucideIcon } from "lucide-react";

const keywordIcons: Array<[RegExp, LucideIcon]> = [
  [/pizza/i, Pizza],
  [/tatlı|dessert|dondurma|pasta/i, IceCream],
  [/içecek|kahve|drink|coffee/i, Coffee],
  [/burger|sandviç|sandwich/i, Sandwich],
  [/yan ürün|aperatif|atıştırmalık|snack/i, Cookie]
];

export function iconForCategoryName(name: string): LucideIcon {
  for (const [pattern, icon] of keywordIcons) {
    if (pattern.test(name)) return icon;
  }
  return UtensilsCrossed;
}
