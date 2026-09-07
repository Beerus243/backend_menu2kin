/** Contrat mobile initial : price est un entier FC, priceCdf le montant canonique. */
export interface Dish {
  id: string;
  name: string;
  category: string;
  price: number;
  priceCdf: string;
  currency: 'CDF';
  restaurantId: string;
  restaurant: string;
  area: string;
  image: string;
  description: string;
  servings: number;
  available: boolean;
  open: boolean;
  daily: boolean;
  rating: number;
  reviewCount: number;
  likes: number;
}
export interface Restaurant {
  id: string;
  name: string;
  area: string;
  open: boolean;
}
