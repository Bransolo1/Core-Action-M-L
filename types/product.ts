export interface BoxDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightGrams: number;
}

export interface SizeRun {
  size: string;
  /** Percentage of total order, 0–100. All sizes in a curve must sum to 100. */
  pct: number;
}

export interface SizeCurve {
  label: string;
  sizes: SizeRun[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subCategory?: string;
  /** ID of the supplier for this product */
  supplierId?: string;
  /** RRP in cents */
  rrpCents: number;
  /** Cost price (ex-works) in cents */
  costCents: number;
  /** Landed cost (inc. freight + duties) in cents */
  landedCostCents: number;
  /** Freight + duty factor, e.g. 1.15 = 15% on top of cost */
  landedCostFactor: number;
  boxDimensions?: BoxDimensions;
  /** Units per carton */
  unitsPerCarton: number;
  /** Size curve for apparel/footwear — percentages per size */
  sizeCurve?: SizeCurve;
  isActive: boolean;
  isNewToMarket: boolean;
  /** ID of analogous product used for new-to-market prediction */
  analogousProductId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;

// ─── CORE Action Sports Category Taxonomy ────────────────────────────────────

export const CORE_CATEGORIES = {
  "Scooters": [
    "Complete Scooters",
    "Pro Scooters",
    "Kids Scooters",
  ],
  "Scooter Parts": [
    "Bars",
    "Decks",
    "Wheels",
    "Forks",
    "Clamps",
    "Headsets",
    "Grips",
    "Grip Tape",
    "Bearings",
    "Spare Parts",
  ],
  "Protection": [
    "Helmets",
    "Knee Pads",
    "Gloves",
    "Ankle Pads",
    "Wrist Guards",
    "Elbow Pads",
    "Hip Pads",
    "Pad Sets",
  ],
  "Skate": [
    "Skates",
    "Inline Wheels",
    "Skate Bearings",
    "Skate Accessories",
  ],
  "Skateboard": [
    "Complete Boards",
    "Plastic Cruisers",
    "Grip Tape",
    "Bearings",
    "Hardware",
  ],
  "Kids": [
    "Kids Scooters",
    "Kids Skates",
    "Kids Helmets",
    "Kids Pads",
    "Kids Ramps",
  ],
  "Accessories": [
    "Ramps",
    "Clothing",
    "Bags",
    "Stickers",
    "Wax",
    "General Accessories",
  ],
  "Bike": [
    "Grips",
    "Headsets",
    "Gloves",
  ],
} as const;

export type CoreCategory = keyof typeof CORE_CATEGORIES;
export type CoreSubCategory<C extends CoreCategory> = (typeof CORE_CATEGORIES)[C][number];

export const CORE_CATEGORY_NAMES = Object.keys(CORE_CATEGORIES) as CoreCategory[];

/** Categories where a size/run curve should be shown in the product form */
export const SIZE_CURVE_CATEGORIES = new Set([
  "Apparel",      // legacy
  "Accessories",  // clothing sub
  "Protection",   // helmets / pads (XS–XL)
  "Scooter Parts",// decks by width, bars by height
  "Kids",         // age-based sizing
]);

/** Default size curves by category — used as starting point when adding products */
export const DEFAULT_SIZE_CURVES: Record<string, SizeCurve> = {
  Protection: {
    label: "Helmet / Pad Size Run",
    sizes: [
      { size: "XS", pct: 10 },
      { size: "S",  pct: 25 },
      { size: "M",  pct: 35 },
      { size: "L",  pct: 20 },
      { size: "XL", pct: 10 },
    ],
  },
  "Scooter Parts": {
    label: "Deck Width Run",
    sizes: [
      { size: '4.5"', pct: 30 },
      { size: '5"',   pct: 35 },
      { size: '5.5"', pct: 25 },
      { size: '6"',   pct: 10 },
    ],
  },
  Kids: {
    label: "Kids Age/Size Run",
    sizes: [
      { size: "3–5y",  pct: 20 },
      { size: "5–7y",  pct: 35 },
      { size: "7–9y",  pct: 30 },
      { size: "9–12y", pct: 15 },
    ],
  },
  Accessories: {
    label: "Clothing Size Run",
    sizes: [
      { size: "XS", pct: 10 },
      { size: "S",  pct: 20 },
      { size: "M",  pct: 35 },
      { size: "L",  pct: 25 },
      { size: "XL", pct: 10 },
    ],
  },
};
