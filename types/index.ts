export interface Product {
    id: number | string;
    title: string;
    name?: string; // For backward compatibility if needed
    price: number;
    image?: string | null;
    images?: string[] | null;
    category?: string | null;
    categoryId?: number | null;
    description?: string | null;
    stock?: number;
    slug?: string;
    /** Sold, but still shown on the storefront for 24 hours (see shared/catalog.ts). */
    soldOut?: boolean;
    soldOutAt?: string | Date | null;
}